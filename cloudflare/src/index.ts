// Reverse ATS — centralized scrape ingest + AI preprocessing Worker.
//
// Routes:
//   POST /ingest     — receives scraped jobs from GitHub Actions
//   GET  /jobs       — read jobs (verification + future API)
//   GET  /health     — uptime + ingest stats
//
// Scheduled (every 30 min):
//   - Walk jobs that don't have a row in jobs_structured yet
//   - Preprocess + embed up to N per run (rate-limit Workers AI gracefully)

import type { ExportedHandler, ScheduledController, ExecutionContext } from "@cloudflare/workers-types";
import type {
  Env,
  IngestRequest,
  IngestResponse,
  IngestJob,
  HealthResponse,
  StructuredJob,
  PreprocessPendingJob,
  PreprocessResult,
} from "./schema";
import { preprocessJob, PREPROCESS_MODEL } from "./preprocess";
import { embedStructuredJob, packVector, EMBEDDING_MODEL } from "./embed";
import { handleAdmin } from "./admin";
import { handleProfile } from "./profile";
import { handleInventory } from "./inventory";
import { handleMatches, runDailyDigest, handleDigestBatch } from "./digest";
import { handleFeedAndPipeline } from "./feed";

// Cron expression (must match wrangler.toml) that fires the once-a-day match
// digest. All other ticks run the reaper + preprocess trickle.
const DAILY_DIGEST_CRON = "0 14 * * *"; // 14:00 UTC ≈ 6-7am PT

// How many jobs the scheduled handler preprocesses per 30-min cron tick.
// The LLM structured-extraction step is the Workers-AI free-tier neuron
// bottleneck (~10K neurons/day), so the bulk backlog is drained off-box by
// the GX10 lane (scripts/preprocess_backlog_gx10.py -> /preprocess/*) using a
// free local LLM. This in-Worker pass is now a small fallback trickle for new
// jobs that arrive between GX10 runs — keep it low so it never blows the quota.
const PREPROCESS_BATCH_SIZE = 15;

// A job that hasn't been re-seen by any scrape lane in this many days is
// treated as delisted (filled / closed / board removed) and flipped to
// expired = 1. Every active company is re-scraped every ~2h, so a job unseen
// for a full week is almost certainly gone. If a source breaks for >7 days its
// jobs expire but auto-revive (expired→0) the moment they're re-seen.
const STALE_JOB_DAYS = 7;

const handler: ExportedHandler<Env> = {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight — the marketing site (different origin) hits /health and
    // /jobs from the browser. Permissive on read-only endpoints, strict on /ingest.
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "POST" && url.pathname === "/ingest") {
      return handleIngest(request, env, ctx);
    }
    // Off-box preprocessing lane (GX10 free local LLM). Bearer INGEST_SECRET.
    if (request.method === "GET" && url.pathname === "/preprocess/pending") {
      return handlePreprocessPending(request, env);
    }
    if (request.method === "POST" && url.pathname === "/preprocess/results") {
      return handlePreprocessResults(request, env);
    }
    // GX10 daily-digest lane pulls the day's matches + inventory here.
    if (request.method === "GET" && url.pathname === "/digest/batch") {
      return withCors(await handleDigestBatch(request, env), origin);
    }
    if (request.method === "GET" && url.pathname === "/jobs") {
      return withCors(await handleListJobs(request, env), origin);
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return withCors(await handleHealth(env), origin);
    }

    // Per-user app endpoints (Supabase JWT-gated). Returns null for non-/api paths.
    const profileResponse = await handleProfile(request, env);
    if (profileResponse) return withCors(profileResponse, origin);

    const inventoryResponse = await handleInventory(request, env);
    if (inventoryResponse) return withCors(inventoryResponse, origin);

    const matchesResponse = await handleMatches(request, env);
    if (matchesResponse) return withCors(matchesResponse, origin);

    const feedResponse = await handleFeedAndPipeline(request, env);
    if (feedResponse) return withCors(feedResponse, origin);

    // Admin (Supabase JWT-gated). handleAdmin returns null for non-admin paths.
    const adminResponse = await handleAdmin(request, env);
    if (adminResponse) return withCors(adminResponse, origin);

    return jsonResponse({ ok: false, error: "not found" }, 404);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Don't await — Workers will keep the runtime alive via ctx.waitUntil.
    if (controller.cron === DAILY_DIGEST_CRON) {
      // Once-a-day branch: compute + email each user's top job matches.
      ctx.waitUntil(runDailyDigest(env));
      return;
    }
    // Every other tick: reap stale jobs (cheap UPDATE), then trickle-preprocess.
    ctx.waitUntil(
      (async () => {
        await expireStaleJobs(env);
        await preprocessPending(env);
      })(),
    );
  },
};

export default handler;

// ─── POST /ingest ───────────────────────────────────────────────────────────

async function handleIngest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Auth: shared secret in Authorization header, set as a Worker secret.
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.INGEST_SECRET}`;
  if (!env.INGEST_SECRET || auth !== expected) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  let body: IngestRequest;
  try {
    body = (await request.json()) as IngestRequest;
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }
  if (!body || !Array.isArray(body.jobs)) {
    return jsonResponse({ ok: false, error: "expected { source, jobs: [...] }" }, 400);
  }

  const startedAt = nowIso();
  const runResult = await env.DB.prepare(
    `INSERT INTO ingest_runs (source, started_at, jobs_received) VALUES (?, ?, ?)`,
  )
    .bind(body.source || "unknown", startedAt, body.jobs.length)
    .run();
  const ingestRunId = Number(runResult.meta.last_row_id);

  let newCount = 0;
  let updatedCount = 0;
  const errors: string[] = [];

  for (const job of body.jobs) {
    if (!job?.id || !job?.company || !job?.title || !job?.url) {
      errors.push(`skipping malformed job: ${JSON.stringify(job).slice(0, 120)}`);
      continue;
    }
    try {
      const result = await upsertJob(env, job);
      if (result === "new") newCount++;
      else if (result === "updated") updatedCount++;
    } catch (err) {
      errors.push(`upsert ${job.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const completedAt = nowIso();
  await env.DB.prepare(
    `UPDATE ingest_runs
       SET completed_at = ?, jobs_new = ?, jobs_updated = ?, errors = ?
     WHERE id = ?`,
  )
    .bind(completedAt, newCount, updatedCount, errors.length ? JSON.stringify(errors) : null, ingestRunId)
    .run();

  // Persist per-company scrape outcomes if the pipeline sent them. Each row
  // gets the current ingest_run_id so we can correlate "company X returned 0"
  // back to a specific run timestamp + source. Older pipelines that don't
  // send this field are a no-op — backwards-compatible.
  if (Array.isArray(body.company_stats) && body.company_stats.length > 0) {
    const statRanAt = completedAt;
    for (const stat of body.company_stats) {
      if (!stat?.company || !stat?.ats || !stat?.slug) continue;
      try {
        await env.DB.prepare(
          `INSERT INTO scrape_company_runs
             (ingest_run_id, company, ats, slug, raw_count, filtered_count, error, ran_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            ingestRunId,
            stat.company,
            stat.ats,
            stat.slug,
            Number(stat.raw_count ?? 0),
            Number(stat.filtered_count ?? 0),
            stat.error ?? null,
            statRanAt,
          )
          .run();
      } catch (err) {
        errors.push(`company_stat ${stat.ats}/${stat.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Kick off async preprocessing in the background — don't block the ingest response.
  ctx.waitUntil(preprocessPending(env));

  const response: IngestResponse = {
    ok: true,
    ingest_run_id: ingestRunId,
    received: body.jobs.length,
    new: newCount,
    updated: updatedCount,
    errors,
  };
  return jsonResponse(response, 200);
}

async function upsertJob(env: Env, job: IngestJob): Promise<"new" | "updated"> {
  const now = nowIso();
  const remote = job.remote ? 1 : 0;
  const firstSeen = job.first_seen_at || now;
  const fingerprint = await computeFingerprint(job.company, job.title, job.location ?? null);

  const existing = await env.DB.prepare(`SELECT id, fingerprint FROM jobs WHERE id = ?`)
    .bind(job.id)
    .first<{ id: string; fingerprint: string | null }>();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO jobs (
        id, company, title, url, location, department, team,
        description_full, description_snippet, category, ats_type,
        remote, first_seen_at, last_seen_at, expired,
        posted_at, fingerprint,
        employment_type, workplace_type,
        salary_min, salary_max, salary_currency, comp_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        job.id,
        job.company,
        job.title,
        job.url,
        job.location ?? null,
        job.department ?? null,
        job.team ?? null,
        job.description_full ?? null,
        job.description_snippet ?? null,
        job.category ?? null,
        job.ats_type ?? null,
        remote,
        firstSeen,
        job.last_seen_at || now,
        job.posted_at ?? null,
        fingerprint,
        job.employment_type ?? null,
        job.workplace_type ?? null,
        job.salary_min ?? null,
        job.salary_max ?? null,
        job.salary_currency ?? null,
        job.comp_summary ?? null,
      )
      .run();

    // Append-only repost log keyed by fingerprint. New job_id with an
    // existing fingerprint = a repost; the count drives the UI badge.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO job_reposts (fingerprint, job_id, first_seen_at, posted_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(fingerprint, job.id, firstSeen, job.posted_at ?? null)
      .run();

    return "new";
  }

  // Existing — refresh description (snippet may improve over scrapes), bump
  // last_seen, fill in posted_at/fingerprint if the previous scrape didn't
  // have them, and clear expired flag if the job has reappeared.
  // COALESCE on the new comp/workplace fields so a future scrape that loses
  // a previously-disclosed value (e.g. employer redacted, regex didn't fire,
  // includeCompensation flag temporarily dropped) doesn't blank the column.
  await env.DB.prepare(
    `UPDATE jobs
       SET company             = ?,
           title               = ?,
           url                 = ?,
           location            = COALESCE(?, location),
           department          = COALESCE(?, department),
           team                = COALESCE(?, team),
           description_full    = COALESCE(?, description_full),
           description_snippet = COALESCE(?, description_snippet),
           category            = COALESCE(?, category),
           ats_type            = COALESCE(?, ats_type),
           remote              = ?,
           last_seen_at        = ?,
           expired             = 0,
           posted_at           = COALESCE(posted_at, ?),
           fingerprint         = COALESCE(fingerprint, ?),
           employment_type     = COALESCE(?, employment_type),
           workplace_type      = COALESCE(?, workplace_type),
           salary_min          = COALESCE(?, salary_min),
           salary_max          = COALESCE(?, salary_max),
           salary_currency     = COALESCE(?, salary_currency),
           comp_summary        = COALESCE(?, comp_summary)
     WHERE id = ?`,
  )
    .bind(
      job.company,
      job.title,
      job.url,
      job.location ?? null,
      job.department ?? null,
      job.team ?? null,
      job.description_full ?? null,
      job.description_snippet ?? null,
      job.category ?? null,
      job.ats_type ?? null,
      remote,
      job.last_seen_at || now,
      job.posted_at ?? null,
      fingerprint,
      job.employment_type ?? null,
      job.workplace_type ?? null,
      job.salary_min ?? null,
      job.salary_max ?? null,
      job.salary_currency ?? null,
      job.comp_summary ?? null,
      job.id,
    )
    .run();

  // Backfill the repost log for jobs that pre-date this column.
  if (!existing.fingerprint) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO job_reposts (fingerprint, job_id, first_seen_at, posted_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(
        fingerprint,
        job.id,
        firstSeen,
        job.posted_at ?? null,
      )
      .run();
  }

  return "updated";
}

// Content-only signature stable across repostings: company + normalized title +
// normalized location. Excludes URL on purpose — a repost almost always changes
// the URL but keeps these three the same. SHA-256 over a single delimited
// string keeps the value short, deterministic, and indexable.
async function computeFingerprint(
  company: string,
  title: string,
  location: string | null,
): Promise<string> {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const raw = `${norm(company)}|${norm(title)}|${norm(location ?? "")}`;
  const data = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── GET /jobs ──────────────────────────────────────────────────────────────

async function handleListJobs(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
  const since = url.searchParams.get("since");

  const rows = since
    ? await env.DB.prepare(
        `SELECT id, company, title, url, location, category, first_seen_at, last_seen_at
           FROM jobs
          WHERE first_seen_at >= ? AND expired = 0
          ORDER BY first_seen_at DESC
          LIMIT ?`,
      )
        .bind(since, limit)
        .all()
    : await env.DB.prepare(
        `SELECT id, company, title, url, location, category, first_seen_at, last_seen_at
           FROM jobs
          WHERE expired = 0
          ORDER BY first_seen_at DESC
          LIMIT ?`,
      )
        .bind(limit)
        .all();

  return jsonResponse({ ok: true, jobs: rows.results || [] }, 200);
}

// ─── GET /health ────────────────────────────────────────────────────────────

async function handleHealth(env: Env): Promise<Response> {
  const [jobsRow, activeRow, expiredRow, structuredRow, pendingRow, embeddedRow, lastIngest] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE expired = 0`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE expired = 1`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs_structured WHERE preprocess_error IS NULL`).first<{ n: number }>(),
    // Active jobs still awaiting structured extraction — the backlog the GX10
    // lane is draining. This is the number to watch trend toward 0.
    env.DB
      .prepare(
        `SELECT COUNT(*) AS n FROM jobs j
           LEFT JOIN jobs_structured s ON s.job_id = j.id
          WHERE j.expired = 0 AND s.job_id IS NULL
            AND COALESCE(NULLIF(j.description_full, ''), NULLIF(j.description_snippet, '')) IS NOT NULL`,
      )
      .first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs_embeddings`).first<{ n: number }>(),
    env.DB
      .prepare(`SELECT started_at, jobs_new FROM ingest_runs ORDER BY id DESC LIMIT 1`)
      .first<{ started_at: string; jobs_new: number }>(),
  ]);

  const response: HealthResponse = {
    ok: true,
    total_jobs: jobsRow?.n ?? 0,
    active_jobs: activeRow?.n ?? 0,
    expired_jobs: expiredRow?.n ?? 0,
    total_preprocessed: structuredRow?.n ?? 0,
    preprocess_backlog: pendingRow?.n ?? 0,
    total_embedded: embeddedRow?.n ?? 0,
    last_ingest_at: lastIngest?.started_at ?? null,
    last_ingest_jobs: lastIngest?.jobs_new ?? null,
  };
  return jsonResponse(response, 200);
}

// ─── Scheduled: preprocess pending jobs ─────────────────────────────────────

async function preprocessPending(env: Env): Promise<void> {
  // Find jobs that haven't been preprocessed yet (or had an error worth retrying).
  const pending = await env.DB.prepare(
    `SELECT j.id, j.title, j.company, j.description_full, j.description_snippet
       FROM jobs j
       LEFT JOIN jobs_structured s ON s.job_id = j.id
      WHERE j.expired = 0
        AND (s.job_id IS NULL OR s.preprocess_error IS NOT NULL)
        -- Skip jobs with no description text (mostly Workday, which the scraper
        -- captures title-only). They can't be structured/matched and otherwise
        -- clog the queue, getting re-pulled every run and never succeeding.
        AND COALESCE(NULLIF(j.description_full, ''), NULLIF(j.description_snippet, '')) IS NOT NULL
      ORDER BY j.first_seen_at DESC
      LIMIT ?`,
  )
    .bind(PREPROCESS_BATCH_SIZE)
    .all();

  const jobs = pending.results || [];
  if (jobs.length === 0) return;

  let okCount = 0;
  for (const j of jobs as Array<{
    id: string;
    title: string;
    company: string;
    description_full: string | null;
    description_snippet: string | null;
  }>) {
    const { structured, error, model } = await preprocessJob(env.AI, j);
    if (structured) {
      await storeStructuredAndEmbed(env, { id: j.id, title: j.title, company: j.company }, structured, model);
      okCount++;
    } else {
      await storePreprocessError(env, j.id, model, error || "unknown");
    }
  }

  // Update the latest ingest_run row with the preprocess count, for visibility.
  await env.DB.prepare(
    `UPDATE ingest_runs
       SET jobs_preprocessed = COALESCE(jobs_preprocessed, 0) + ?
     WHERE id = (SELECT MAX(id) FROM ingest_runs)`,
  )
    .bind(okCount)
    .run();

  console.log(
    `preprocess batch: ${okCount}/${jobs.length} ok (model: ${PREPROCESS_MODEL}, embed: ${EMBEDDING_MODEL})`,
  );
}

// ─── Stale-job reaper ───────────────────────────────────────────────────────
//
// Flip active jobs that no scrape lane has re-seen within STALE_JOB_DAYS to
// expired = 1. The feed only ever shows expired = 0, so this is what removes
// filled/closed/delisted roles. Cheap single UPDATE, runs every cron tick.

async function expireStaleJobs(env: Env): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_JOB_DAYS * 86_400_000).toISOString();
  const res = await env.DB.prepare(
    `UPDATE jobs
        SET expired = 1, expired_at = ?
      WHERE expired = 0 AND last_seen_at < ?`,
  )
    .bind(nowIso(), cutoff)
    .run();
  const n = res.meta.changes ?? 0;
  if (n > 0) console.log(`reaper: expired ${n} jobs not seen since ${cutoff}`);
  return n;
}

// ─── Shared structured-store + embed (used by in-Worker + GX10 lanes) ───────

async function storeStructuredAndEmbed(
  env: Env,
  job: { id: string; title: string; company: string },
  structured: StructuredJob,
  model: string,
): Promise<void> {
  const now = nowIso();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO jobs_structured (
      job_id, seniority, years_experience_min,
      must_have_skills, nice_to_have_skills, responsibilities,
      comp_min, comp_max, remote_policy, industry_tags,
      preprocessed_at, preprocess_model, preprocess_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  )
    .bind(
      job.id,
      structured.seniority,
      structured.years_experience_min,
      JSON.stringify(structured.must_have_skills ?? []),
      JSON.stringify(structured.nice_to_have_skills ?? []),
      JSON.stringify(structured.responsibilities ?? []),
      structured.comp_min ?? null,
      structured.comp_max ?? null,
      structured.remote_policy ?? null,
      JSON.stringify(structured.industry_tags ?? []),
      now,
      model,
    )
    .run();

  // Embed on Workers AI (bge-m3) regardless of where extraction ran, so every
  // job vector lives in the same space as the user's resume embedding.
  const { vector, error: embedError, model: embedModel } = await embedStructuredJob(
    env.AI,
    { title: job.title, company: job.company },
    structured,
  );
  if (vector) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO jobs_embeddings (job_id, embedding, embedded_at, model)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(job.id, packVector(vector), now, embedModel)
      .run();
  } else {
    console.log(`embed failed for ${job.id}: ${embedError}`);
  }
}

async function storePreprocessError(env: Env, jobId: string, model: string, error: string): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO jobs_structured
     (job_id, preprocessed_at, preprocess_model, preprocess_error)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(jobId, nowIso(), model, error)
    .run();
}

// ─── Off-box preprocessing lane (GX10 free local LLM) ───────────────────────
//
// The LLM structured-extraction step is the Workers-AI neuron bottleneck. The
// GX10 box (residential IP, already runs the Workday scrape cron) pulls pending
// jobs here, runs a free local LLM, and POSTs structured results back. The
// Worker still owns embedding (bge-m3) so vectors stay consistent.

async function handlePreprocessPending(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") || "";
  if (!env.INGEST_SECRET || auth !== `Bearer ${env.INGEST_SECRET}`) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 500);

  const pending = await env.DB.prepare(
    `SELECT j.id, j.title, j.company, j.description_full, j.description_snippet
       FROM jobs j
       LEFT JOIN jobs_structured s ON s.job_id = j.id
      WHERE j.expired = 0
        AND (s.job_id IS NULL OR s.preprocess_error IS NOT NULL)
        -- Skip jobs with no description text (mostly Workday, which the scraper
        -- captures title-only). They can't be structured/matched and otherwise
        -- clog the queue, getting re-pulled every run and never succeeding.
        AND COALESCE(NULLIF(j.description_full, ''), NULLIF(j.description_snippet, '')) IS NOT NULL
      ORDER BY j.first_seen_at DESC
      LIMIT ?`,
  )
    .bind(limit)
    .all();

  const jobs: PreprocessPendingJob[] = (pending.results || []).map((r) => {
    const row = r as {
      id: string;
      title: string;
      company: string;
      description_full: string | null;
      description_snippet: string | null;
    };
    return {
      id: row.id,
      title: row.title,
      company: row.company,
      description: row.description_full || row.description_snippet || null,
    };
  });

  return jsonResponse({ ok: true, jobs }, 200);
}

async function handlePreprocessResults(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") || "";
  if (!env.INGEST_SECRET || auth !== `Bearer ${env.INGEST_SECRET}`) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  let body: { results?: PreprocessResult[] };
  try {
    body = (await request.json()) as { results?: PreprocessResult[] };
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }
  if (!body || !Array.isArray(body.results)) {
    return jsonResponse({ ok: false, error: "expected { results: [...] }" }, 400);
  }

  let stored = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const r of body.results) {
    if (!r?.job_id) {
      errors.push("skipping result with no job_id");
      continue;
    }
    try {
      if (r.structured) {
        // Need title + company for the embedding text — fetch from jobs.
        const job = await env.DB.prepare(`SELECT id, title, company FROM jobs WHERE id = ?`)
          .bind(r.job_id)
          .first<{ id: string; title: string; company: string }>();
        if (!job) {
          errors.push(`unknown job_id: ${r.job_id}`);
          continue;
        }
        await storeStructuredAndEmbed(env, job, r.structured, "gx10-local-llm");
        stored++;
      } else {
        await storePreprocessError(env, r.job_id, "gx10-local-llm", r.error || "unknown");
        failed++;
      }
    } catch (err) {
      errors.push(`${r.job_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return jsonResponse({ ok: true, stored, failed, errors }, 200);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── CORS ──────────────────────────────────────────────────────────────────
//
// /health and /jobs are public read-only endpoints — the marketing site
// (deployed to a different origin on Cloudflare Pages) hits them from the
// browser. /ingest stays uncors-d since it requires the bearer secret anyway
// and is only ever called server-to-server from GitHub Actions.

const ALLOWED_ORIGIN_EXACT = new Set([
  "https://reverse-ats.app",
  "https://www.reverse-ats.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGIN_EXACT.has(origin)) return true;
  // Pages preview deploys: https://<hash>.reverse-ats.pages.dev
  try {
    const host = new URL(origin).hostname;
    return host === "reverse-ats.pages.dev" || host.endsWith(".reverse-ats.pages.dev");
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
  }
  return headers;
}

function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
