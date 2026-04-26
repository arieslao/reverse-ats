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
} from "./schema";
import { preprocessJob, PREPROCESS_MODEL } from "./preprocess";
import { embedStructuredJob, packVector, EMBEDDING_MODEL } from "./embed";
import { handleAdmin } from "./admin";
import { handleProfile } from "./profile";
import { handleFeedAndPipeline } from "./feed";

// How many jobs the scheduled handler preprocesses per 30-min cron tick.
// 60/run × 48 runs/day = 2,880 jobs/day capacity — plenty of headroom for
// the ~200 new jobs/day we expect across all 220+ companies.
const PREPROCESS_BATCH_SIZE = 60;

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
    if (request.method === "GET" && url.pathname === "/jobs") {
      return withCors(await handleListJobs(request, env), origin);
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return withCors(await handleHealth(env), origin);
    }

    // Per-user app endpoints (Supabase JWT-gated). Returns null for non-/api paths.
    const profileResponse = await handleProfile(request, env);
    if (profileResponse) return withCors(profileResponse, origin);

    const feedResponse = await handleFeedAndPipeline(request, env);
    if (feedResponse) return withCors(feedResponse, origin);

    // Admin (Supabase JWT-gated). handleAdmin returns null for non-admin paths.
    const adminResponse = await handleAdmin(request, env);
    if (adminResponse) return withCors(adminResponse, origin);

    return jsonResponse({ ok: false, error: "not found" }, 404);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Don't await — Workers will keep the runtime alive via ctx.waitUntil.
    ctx.waitUntil(preprocessPending(env));
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
        id, company, title, url, location, department,
        description_full, description_snippet, category, ats_type,
        remote, first_seen_at, last_seen_at, expired,
        posted_at, fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
      .bind(
        job.id,
        job.company,
        job.title,
        job.url,
        job.location ?? null,
        job.department ?? null,
        job.description_full ?? null,
        job.description_snippet ?? null,
        job.category ?? null,
        job.ats_type ?? null,
        remote,
        firstSeen,
        job.last_seen_at || now,
        job.posted_at ?? null,
        fingerprint,
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
  await env.DB.prepare(
    `UPDATE jobs
       SET company             = ?,
           title               = ?,
           url                 = ?,
           location            = COALESCE(?, location),
           department          = COALESCE(?, department),
           description_full    = COALESCE(?, description_full),
           description_snippet = COALESCE(?, description_snippet),
           category            = COALESCE(?, category),
           ats_type            = COALESCE(?, ats_type),
           remote              = ?,
           last_seen_at        = ?,
           expired             = 0,
           posted_at           = COALESCE(posted_at, ?),
           fingerprint         = COALESCE(fingerprint, ?)
     WHERE id = ?`,
  )
    .bind(
      job.company,
      job.title,
      job.url,
      job.location ?? null,
      job.department ?? null,
      job.description_full ?? null,
      job.description_snippet ?? null,
      job.category ?? null,
      job.ats_type ?? null,
      remote,
      job.last_seen_at || now,
      job.posted_at ?? null,
      fingerprint,
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
  const [jobsRow, structuredRow, embeddedRow, lastIngest] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs_structured WHERE preprocess_error IS NULL`).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs_embeddings`).first<{ n: number }>(),
    env.DB
      .prepare(`SELECT started_at, jobs_new FROM ingest_runs ORDER BY id DESC LIMIT 1`)
      .first<{ started_at: string; jobs_new: number }>(),
  ]);

  const response: HealthResponse = {
    ok: true,
    total_jobs: jobsRow?.n ?? 0,
    total_preprocessed: structuredRow?.n ?? 0,
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
    const now = nowIso();

    if (structured) {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO jobs_structured (
          job_id, seniority, years_experience_min,
          must_have_skills, nice_to_have_skills, responsibilities,
          comp_min, comp_max, remote_policy, industry_tags,
          preprocessed_at, preprocess_model, preprocess_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
        .bind(
          j.id,
          structured.seniority,
          structured.years_experience_min,
          JSON.stringify(structured.must_have_skills),
          JSON.stringify(structured.nice_to_have_skills),
          JSON.stringify(structured.responsibilities),
          structured.comp_min,
          structured.comp_max,
          structured.remote_policy,
          JSON.stringify(structured.industry_tags),
          now,
          model,
        )
        .run();

      // Embed immediately after preprocess succeeds — keeps the two in sync.
      const { vector, error: embedError, model: embedModel } = await embedStructuredJob(
        env.AI,
        { title: j.title, company: j.company },
        structured,
      );
      if (vector) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO jobs_embeddings (job_id, embedding, embedded_at, model)
           VALUES (?, ?, ?, ?)`,
        )
          .bind(j.id, packVector(vector), now, embedModel)
          .run();
      } else {
        console.log(`embed failed for ${j.id}: ${embedError}`);
      }
      okCount++;
    } else {
      // Record the error so we don't infinitely retry.
      await env.DB.prepare(
        `INSERT OR REPLACE INTO jobs_structured
         (job_id, preprocessed_at, preprocess_model, preprocess_error)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(j.id, now, model, error || "unknown")
        .run();
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
