// Per-user job feed + pipeline + scoring endpoints.
//
// Routing convention (handled here):
//   GET  /api/jobs                       — paginated, filtered, score-merged
//   GET  /api/jobs/:id                   — single job (with score + pipeline state)
//   POST /api/jobs/:id/dismiss           — hide from feed
//   POST /api/jobs/:id/save              — add to pipeline (stage=saved)
//   POST /api/jobs/:id/cover-letter      — generate via Workers AI
//   GET  /api/feed/industries            — distinct categories with counts
//   GET  /api/feed/locations             — country/state/city tokens
//   GET  /api/pipeline                   — list user's pipeline (grouped by stage)
//   POST /api/pipeline                   — { job_id, stage?, notes? }
//   PUT  /api/pipeline/:id               — update stage / fields
//   DELETE /api/pipeline/:id             — remove
//   GET  /api/analytics                  — funnel + counts
//   GET  /api/scoring/stats              — count of scored / unscored saves
//   POST /api/scoring/rescore            — score all saved+feed jobs vs. profile

import type { Env } from "./schema";
import { fetchTier, verifyRequest } from "./supabase-auth";
import {
  LIFETIME_LIMITS,
  LIMITS,
  checkAndConsume,
  checkLifetime,
  lifetimeLimitFor,
  limitFor,
  readUsage,
} from "./usage";

const PIPELINE_STAGES = new Set([
  "saved",
  "applied",
  "phone_screen",
  "technical",
  "final",
  "offer",
  "rejected",
  "withdrawn",
]);

export async function handleFeedAndPipeline(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Quick path predicate so the parent router falls through cleanly for non-matches.
  if (
    !path.startsWith("/api/jobs") &&
    !path.startsWith("/api/feed/") &&
    !path.startsWith("/api/pipeline") &&
    path !== "/api/analytics" &&
    path !== "/api/usage" &&
    !path.startsWith("/api/scoring/")
  ) {
    return null;
  }

  const identity = await verifyRequest(request, env);
  if (!identity) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  const userId = identity.userId;

  // ─── /api/jobs ──────────────────────────────────────────────────────────
  if (path === "/api/jobs" && request.method === "GET") {
    return listJobs(request, env, userId);
  }

  // /api/jobs/:id  and  /api/jobs/:id/(dismiss|save|cover-letter)
  const jobMatch = path.match(/^\/api\/jobs\/([A-Za-z0-9_\-:.]+)(\/(dismiss|save|cover-letter))?$/);
  if (jobMatch) {
    const jobId = jobMatch[1];
    const action = jobMatch[3];
    if (!action && request.method === "GET") return getJob(env, userId, jobId);
    if (action === "dismiss" && request.method === "POST") return dismissJob(env, userId, jobId);
    if (action === "save" && request.method === "POST") return saveJobToPipeline(env, userId, jobId);
    if (action === "cover-letter" && request.method === "POST") return coverLetter(env, userId, jobId);
  }

  if (path === "/api/feed/industries" && request.method === "GET") return feedIndustries(env);
  if (path === "/api/feed/locations" && request.method === "GET") return feedLocations(env, url);

  if (path === "/api/pipeline" && request.method === "GET") return listPipeline(env, userId);
  if (path === "/api/pipeline" && request.method === "POST") return createPipeline(request, env, userId);

  const pipMatch = path.match(/^\/api\/pipeline\/(\d+)$/);
  if (pipMatch) {
    const id = parseInt(pipMatch[1], 10);
    if (request.method === "PUT") return updatePipeline(request, env, userId, id);
    if (request.method === "DELETE") return deletePipeline(env, userId, id);
  }

  if (path === "/api/analytics" && request.method === "GET") return analytics(env, userId);
  if (path === "/api/scoring/stats" && request.method === "GET") return scoringStats(env, userId);
  if (path === "/api/scoring/rescore" && request.method === "POST") return rescore(env, userId, url);
  if (path === "/api/usage" && request.method === "GET") return usageOverview(env, userId);

  return jsonResponse({ ok: false, error: "not found" }, 404);
}

// ─── /api/usage ─────────────────────────────────────────────────────────────
// Tier limits + today's counts. UI uses this to show "X left today" and the
// upgrade CTA when at cap.

async function usageOverview(env: Env, userId: string): Promise<Response> {
  const tier = await fetchTier(env, userId);
  const states: Record<string, { used: number; remaining: number; limit: number }> = {};
  for (const a of Object.keys(LIMITS)) {
    const s = await readUsage(env, userId, a as keyof typeof LIMITS, tier);
    states[a] = { used: s.used, remaining: s.remaining, limit: s.limit };
  }
  // Lifetime caps — currently just saved_jobs.
  for (const a of Object.keys(LIFETIME_LIMITS)) {
    let count = 0;
    if (a === "saved_jobs") {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM user_pipeline WHERE user_id = ?`)
        .bind(userId)
        .first<{ n: number }>();
      count = row?.n ?? 0;
    }
    const limit = lifetimeLimitFor(a as keyof typeof LIFETIME_LIMITS, tier);
    states[a] = {
      used: count,
      remaining: limit < 0 ? -1 : Math.max(0, limit - count),
      limit,
    };
  }
  return jsonResponse({ ok: true, tier, usage: states }, 200);
}

// ─── /api/jobs (list) ───────────────────────────────────────────────────────

async function listJobs(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") || "20", 10)));
  const search = (url.searchParams.get("search") || "").trim();
  const category = (url.searchParams.get("category") || "").trim();
  const minScore = parseInt(url.searchParams.get("min_score") || "0", 10) || 0;
  const remoteOnly = url.searchParams.get("remote_only") === "true";
  const sinceDays = parseInt(url.searchParams.get("since_days") || "0", 10) || 0;
  const sortBy = url.searchParams.get("sort_by") || "score";
  const locationsParam = url.searchParams.get("locations") || "";
  const locations = locationsParam ? locationsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const where: string[] = ["j.expired = 0"];
  const binds: (string | number)[] = [];

  // Hide already-dismissed and already-saved (in pipeline) jobs.
  where.push("NOT EXISTS (SELECT 1 FROM user_dismissed d WHERE d.user_id = ? AND d.job_id = j.id)");
  binds.push(userId);
  where.push("NOT EXISTS (SELECT 1 FROM user_pipeline p WHERE p.user_id = ? AND p.job_id = j.id)");
  binds.push(userId);

  if (search) {
    where.push("(j.title LIKE ? OR j.company LIKE ? OR j.description_snippet LIKE ?)");
    const term = `%${search}%`;
    binds.push(term, term, term);
  }
  if (category) {
    where.push("j.category = ?");
    binds.push(category);
  }
  if (remoteOnly) where.push("j.remote = 1");
  if (sinceDays > 0) {
    const cutoff = new Date(Date.now() - sinceDays * 86400_000).toISOString();
    where.push("j.first_seen_at >= ?");
    binds.push(cutoff);
  }
  if (locations.length > 0) {
    const ors = locations.map(() => "j.location LIKE ?").join(" OR ");
    where.push(`(${ors})`);
    for (const loc of locations) binds.push(`%${loc}%`);
  }

  // Score filter (against per-user score; if none, fall back to 0).
  const scoreSelect = `COALESCE(s.llm_score, 0) AS llm_score, s.llm_reasoning AS llm_reasoning`;
  if (minScore > 0) {
    where.push("COALESCE(s.llm_score, 0) >= ?");
    binds.push(minScore);
  }

  const orderBy =
    sortBy === "newest" ? "j.first_seen_at DESC"
      : sortBy === "company" ? "j.company ASC, j.first_seen_at DESC"
      : "COALESCE(s.llm_score, 0) DESC, j.first_seen_at DESC";

  const offset = (page - 1) * perPage;

  const total = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM jobs j
       LEFT JOIN user_job_scores s ON s.user_id = ? AND s.job_id = j.id
      WHERE ${where.join(" AND ")}`,
  )
    .bind(userId, ...binds)
    .first<{ n: number }>();

  const rows = await env.DB.prepare(
    `SELECT
        j.id, j.company, j.title, j.url, j.location, j.department,
        j.description_snippet, j.description_full, j.category, j.ats_type,
        j.remote, j.first_seen_at, j.last_seen_at, j.expired,
        ${scoreSelect}
       FROM jobs j
       LEFT JOIN user_job_scores s ON s.user_id = ? AND s.job_id = j.id
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
  )
    .bind(userId, ...binds, perPage, offset)
    .all();

  const jobs = (rows.results || []).map(jobRowToOut);

  return jsonResponse(
    {
      ok: true,
      jobs,
      total: total?.n ?? 0,
      page,
      per_page: perPage,
    },
    200,
  );
}

async function getJob(env: Env, userId: string, jobId: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT j.*,
            s.llm_score AS llm_score, s.llm_reasoning AS llm_reasoning,
            p.stage AS pipeline_stage,
            CASE WHEN d.job_id IS NOT NULL THEN 1 ELSE 0 END AS dismissed
       FROM jobs j
       LEFT JOIN user_job_scores s ON s.user_id = ? AND s.job_id = j.id
       LEFT JOIN user_pipeline   p ON p.user_id = ? AND p.job_id = j.id
       LEFT JOIN user_dismissed  d ON d.user_id = ? AND d.job_id = j.id
      WHERE j.id = ?`,
  )
    .bind(userId, userId, userId, jobId)
    .first();
  if (!row) return jsonResponse({ ok: false, error: "not found" }, 404);
  return jsonResponse({ ok: true, job: jobRowToOut(row) }, 200);
}

async function dismissJob(env: Env, userId: string, jobId: string): Promise<Response> {
  const exists = await env.DB.prepare(`SELECT 1 FROM jobs WHERE id = ?`).bind(jobId).first();
  if (!exists) return jsonResponse({ ok: false, error: "not found" }, 404);
  await env.DB.prepare(
    `INSERT INTO user_dismissed (user_id, job_id, dismissed_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, job_id) DO NOTHING`,
  )
    .bind(userId, jobId, new Date().toISOString())
    .run();
  return jsonResponse({ ok: true }, 200);
}

async function saveJobToPipeline(env: Env, userId: string, jobId: string): Promise<Response> {
  const exists = await env.DB.prepare(`SELECT 1 FROM jobs WHERE id = ?`).bind(jobId).first();
  if (!exists) return jsonResponse({ ok: false, error: "not found" }, 404);

  // Lifetime cap on saved jobs (free tier only; sponsor/admin = unlimited).
  // Skip the cap for re-saves (already in pipeline — idempotent insert).
  const tier = await fetchTier(env, userId);
  const already = await env.DB.prepare(
    `SELECT 1 FROM user_pipeline WHERE user_id = ? AND job_id = ?`,
  )
    .bind(userId, jobId)
    .first();
  if (!already) {
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM user_pipeline WHERE user_id = ?`,
    )
      .bind(userId)
      .first<{ n: number }>();
    const usage = checkLifetime("saved_jobs", tier, countRow?.n ?? 0);
    if (!usage.ok) {
      return jsonResponse(
        {
          ok: false,
          error:
            tier === "free"
              ? `Free accounts can save up to ${usage.limit} jobs. Remove some, or upgrade for unlimited saves.`
              : `Lifetime save cap reached.`,
          tier,
          usage,
        },
        429,
      );
    }
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_pipeline (user_id, job_id, stage, created_at, updated_at)
     VALUES (?, ?, 'saved', ?, ?)
     ON CONFLICT(user_id, job_id) DO NOTHING`,
  )
    .bind(userId, jobId, now, now)
    .run();
  const row = await env.DB.prepare(
    `SELECT * FROM user_pipeline WHERE user_id = ? AND job_id = ?`,
  )
    .bind(userId, jobId)
    .first();
  return jsonResponse({ ok: true, entry: row }, 200);
}

// ─── /api/feed/industries ───────────────────────────────────────────────────

async function feedIndustries(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT category AS id, category AS label, COUNT(*) AS count
       FROM jobs
      WHERE expired = 0 AND category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC`,
  ).all();
  return jsonResponse({ ok: true, industries: rows.results || [] }, 200);
}

// ─── /api/feed/locations ────────────────────────────────────────────────────
// Lightweight version of the local app's hierarchical narrowing.
// Returns countries / states / cities / remote with counts. The frontend can
// pass `?filter=` with already-selected tokens to narrow the buckets.

async function feedLocations(env: Env, url: URL): Promise<Response> {
  const filterParam = url.searchParams.get("filter") || "";
  const filters = filterParam.split(",").map((s) => s.trim()).filter(Boolean);

  let where = "expired = 0 AND location IS NOT NULL AND location != ''";
  const binds: string[] = [];
  for (const f of filters) {
    where += " AND location LIKE ?";
    binds.push(`%${f}%`);
  }

  const rows = await env.DB.prepare(
    `SELECT location, COUNT(*) AS n FROM jobs WHERE ${where} GROUP BY location`,
  )
    .bind(...binds)
    .all();

  const cities = new Map<string, number>();
  const states = new Map<string, number>();
  const countries = new Map<string, number>();
  let remoteCount = 0;
  for (const r of (rows.results || []) as Array<{ location: string; n: number }>) {
    const loc = (r.location || "").trim();
    const n = r.n || 0;
    if (/remote/i.test(loc)) remoteCount += n;
    const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length >= 1) {
      const last = parts[parts.length - 1];
      countries.set(last, (countries.get(last) || 0) + n);
    }
    if (parts.length >= 2) {
      const mid = parts[parts.length - 2];
      states.set(mid, (states.get(mid) || 0) + n);
    }
    if (parts.length >= 3) {
      cities.set(parts[0], (cities.get(parts[0]) || 0) + n);
    }
  }

  const toArr = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

  return jsonResponse(
    {
      ok: true,
      countries: toArr(countries),
      states: toArr(states),
      cities: toArr(cities),
      remote: { count: remoteCount },
    },
    200,
  );
}

// ─── /api/pipeline ──────────────────────────────────────────────────────────

async function listPipeline(env: Env, userId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT
        p.id, p.job_id, p.stage, p.applied_at, p.notes,
        p.contact_name, p.contact_email, p.contact_role,
        p.next_step, p.next_step_date, p.salary_offered, p.cover_letter,
        p.created_at, p.updated_at,
        j.company, j.title, j.location, j.url, j.category, j.remote,
        j.first_seen_at, j.last_seen_at,
        s.llm_score, s.llm_reasoning
       FROM user_pipeline p
       JOIN jobs j ON j.id = p.job_id
       LEFT JOIN user_job_scores s ON s.user_id = p.user_id AND s.job_id = p.job_id
      WHERE p.user_id = ?
      ORDER BY p.updated_at DESC`,
  )
    .bind(userId)
    .all();

  const items = (rows.results || []).map(pipelineRowToOut);
  const byStage: Record<string, ReturnType<typeof pipelineRowToOut>[]> = {};
  for (const it of items) {
    (byStage[it.stage] = byStage[it.stage] || []).push(it);
  }
  return jsonResponse({ ok: true, items, by_stage: byStage }, 200);
}

async function createPipeline(request: Request, env: Env, userId: string): Promise<Response> {
  let body: { job_id?: string; stage?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }
  const jobId = body.job_id;
  if (!jobId) return jsonResponse({ ok: false, error: "job_id required" }, 400);
  const stage = body.stage && PIPELINE_STAGES.has(body.stage) ? body.stage : "saved";
  const now = new Date().toISOString();

  const exists = await env.DB.prepare(`SELECT 1 FROM jobs WHERE id = ?`).bind(jobId).first();
  if (!exists) return jsonResponse({ ok: false, error: "job not found" }, 404);

  await env.DB.prepare(
    `INSERT INTO user_pipeline (user_id, job_id, stage, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, job_id) DO UPDATE SET stage=excluded.stage, notes=excluded.notes, updated_at=excluded.updated_at`,
  )
    .bind(userId, jobId, stage, body.notes || null, now, now)
    .run();

  const row = await env.DB.prepare(
    `SELECT p.*, j.company, j.title, j.url, j.location FROM user_pipeline p
       JOIN jobs j ON j.id = p.job_id WHERE p.user_id = ? AND p.job_id = ?`,
  )
    .bind(userId, jobId)
    .first();
  return jsonResponse({ ok: true, entry: row }, 200);
}

async function updatePipeline(request: Request, env: Env, userId: string, id: number): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  if ("stage" in body) {
    const s = body.stage;
    if (typeof s !== "string" || !PIPELINE_STAGES.has(s)) {
      return jsonResponse({ ok: false, error: "invalid stage" }, 400);
    }
    sets.push("stage = ?");
    vals.push(s);
    if (s === "applied") {
      sets.push("applied_at = COALESCE(applied_at, ?)");
      vals.push(new Date().toISOString());
    }
  }
  for (const f of [
    "notes",
    "contact_name",
    "contact_email",
    "contact_role",
    "next_step",
    "next_step_date",
    "cover_letter",
  ]) {
    if (f in body) {
      const v = body[f];
      if (v === null || v === undefined || v === "") {
        sets.push(`${f} = NULL`);
      } else if (typeof v === "string") {
        sets.push(`${f} = ?`);
        vals.push(v);
      } else {
        return jsonResponse({ ok: false, error: `${f} must be a string` }, 400);
      }
    }
  }
  if ("salary_offered" in body) {
    const v = body.salary_offered;
    if (v === null || v === undefined || v === "") {
      sets.push("salary_offered = NULL");
    } else if (typeof v === "number" && Number.isFinite(v)) {
      sets.push("salary_offered = ?");
      vals.push(Math.round(v));
    } else {
      return jsonResponse({ ok: false, error: "salary_offered must be a number" }, 400);
    }
  }
  if (sets.length === 0) return jsonResponse({ ok: false, error: "no fields to update" }, 400);

  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(id);
  vals.push(userId);

  const result = await env.DB.prepare(
    `UPDATE user_pipeline SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
  )
    .bind(...vals)
    .run();

  if (result.meta.changes === 0) return jsonResponse({ ok: false, error: "not found" }, 404);

  const row = await env.DB.prepare(
    `SELECT p.*, j.company, j.title, j.url, j.location FROM user_pipeline p
       JOIN jobs j ON j.id = p.job_id WHERE p.id = ? AND p.user_id = ?`,
  )
    .bind(id, userId)
    .first();
  return jsonResponse({ ok: true, entry: row }, 200);
}

async function deletePipeline(env: Env, userId: string, id: number): Promise<Response> {
  const r = await env.DB.prepare(`DELETE FROM user_pipeline WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  if (r.meta.changes === 0) return jsonResponse({ ok: false, error: "not found" }, 404);
  return jsonResponse({ ok: true }, 200);
}

// ─── /api/analytics ─────────────────────────────────────────────────────────

async function analytics(env: Env, userId: string): Promise<Response> {
  const stages = await env.DB.prepare(
    `SELECT stage, COUNT(*) AS n FROM user_pipeline WHERE user_id = ? GROUP BY stage`,
  )
    .bind(userId)
    .all();

  const funnel = (stages.results || []) as Array<{ stage: string; n: number }>;
  const stageMap = new Map(funnel.map((r) => [r.stage, r.n]));

  const totalSaved = [...stageMap.values()].reduce((a, b) => a + b, 0);
  const totalApplied =
    [...stageMap.entries()]
      .filter(([s]) => s !== "saved" && s !== "withdrawn")
      .reduce((a, [, n]) => a + n, 0);
  const responses =
    (stageMap.get("phone_screen") || 0) +
    (stageMap.get("technical") || 0) +
    (stageMap.get("final") || 0) +
    (stageMap.get("offer") || 0);
  const responseRate = totalApplied > 0 ? Math.round((responses / totalApplied) * 100) : 0;

  const dismissed = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM user_dismissed WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ n: number }>();

  return jsonResponse(
    {
      ok: true,
      funnel: funnel.map((r) => ({ stage: r.stage, count: r.n })),
      total_saved: totalSaved,
      total_applied: totalApplied,
      response_rate: responseRate,
      total_dismissed: dismissed?.n ?? 0,
    },
    200,
  );
}

// ─── /api/scoring ──────────────────────────────────────────────────────────

async function scoringStats(env: Env, userId: string): Promise<Response> {
  const stats = await env.DB.prepare(
    `SELECT
        (SELECT COUNT(*) FROM jobs j WHERE j.expired = 0
            AND NOT EXISTS (SELECT 1 FROM user_dismissed d WHERE d.user_id = ? AND d.job_id = j.id)) AS total,
        (SELECT COUNT(*) FROM user_job_scores s WHERE s.user_id = ?) AS scored`,
  )
    .bind(userId, userId)
    .first<{ total: number; scored: number }>();
  const total = stats?.total ?? 0;
  const scored = stats?.scored ?? 0;
  return jsonResponse({ ok: true, total, scored, unscored: Math.max(0, total - scored) }, 200);
}

const SCORING_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const SCORE_BATCH_LIMIT = 25;

async function rescore(env: Env, userId: string, url: URL): Promise<Response> {
  const all = url.searchParams.get("all") === "true";

  // Tier-gated daily limit (1 batch = 25 jobs scored). Free=1, Sponsor=4, Admin=20.
  const tier = await fetchTier(env, userId);
  const usage = await checkAndConsume(env, userId, "rescore", tier);
  if (!usage.ok) {
    return jsonResponse(
      {
        ok: false,
        error:
          tier === "free"
            ? `You've used your ${usage.limit} rescore${usage.limit === 1 ? "" : "s"} for today. Upgrade for ${limitFor("rescore", "sponsor")} per day.`
            : `Daily rescore limit reached. Resets at UTC midnight.`,
        tier,
        usage,
      },
      429,
    );
  }

  const profile = await env.DB.prepare(
    `SELECT resume_text, target_roles, must_have_skills FROM user_profiles WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ resume_text: string | null; target_roles: string; must_have_skills: string }>();
  const resume = (profile?.resume_text || "").trim();
  if (resume.length < 50) {
    // Refund: didn't actually score.
    await env.DB.prepare(
      `UPDATE user_usage SET count = MAX(0, count - 1) WHERE user_id = ? AND action = ? AND day = ?`,
    )
      .bind(userId, "rescore", new Date().toISOString().slice(0, 10))
      .run();
    return jsonResponse({ ok: false, error: "Save your resume first." }, 400);
  }

  if (all) {
    await env.DB.prepare(`DELETE FROM user_job_scores WHERE user_id = ?`).bind(userId).run();
  }

  // Pick jobs to score: not yet scored, not dismissed, not expired. Cap per call.
  const targets = await env.DB.prepare(
    `SELECT j.id, j.title, j.company, j.location, j.description_snippet
       FROM jobs j
      WHERE j.expired = 0
        AND NOT EXISTS (SELECT 1 FROM user_job_scores s WHERE s.user_id = ? AND s.job_id = j.id)
        AND NOT EXISTS (SELECT 1 FROM user_dismissed d WHERE d.user_id = ? AND d.job_id = j.id)
      ORDER BY j.first_seen_at DESC
      LIMIT ?`,
  )
    .bind(userId, userId, SCORE_BATCH_LIMIT)
    .all();

  const jobs = (targets.results || []) as Array<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    description_snippet: string | null;
  }>;

  if (jobs.length === 0) {
    return jsonResponse({ ok: true, scored: 0, message: "Nothing to score." }, 200);
  }

  const profileSummary =
    `Resume excerpt:\n${resume.slice(0, 3000)}\n\n` +
    `Target roles: ${profile?.target_roles || "[]"}\n` +
    `Must-have skills: ${profile?.must_have_skills || "[]"}`;

  const schema = {
    type: "object",
    properties: {
      score: { type: "integer" },
      reasoning: { type: "string" },
    },
    required: ["score", "reasoning"],
  };

  let okCount = 0;
  for (const job of jobs) {
    const userPrompt =
      `${profileSummary}\n\n` +
      `Job:\nCompany: ${job.company}\nTitle: ${job.title}\nLocation: ${job.location || "n/a"}\n` +
      `Snippet: ${(job.description_snippet || "").slice(0, 800)}\n\n` +
      `Output a 0-100 fit score and a one-sentence reasoning.`;
    try {
      const response = (await env.AI.run(SCORING_MODEL, {
        messages: [
          {
            role: "system",
            content:
              "You score how well a job posting fits a candidate based on their resume + targets. " +
              "Return JSON {score, reasoning} where score is 0-100 (100 = perfect match).",
          },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.2,
        response_format: { type: "json_schema", json_schema: schema },
      } as Parameters<typeof env.AI.run>[1])) as { response?: unknown };

      let parsed: { score?: unknown; reasoning?: unknown } | null = null;
      const r = response.response;
      if (r && typeof r === "object") parsed = r as typeof parsed;
      else if (typeof r === "string") {
        try { parsed = JSON.parse(r); } catch { parsed = null; }
      }
      if (!parsed) continue;

      const score = typeof parsed.score === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.score)))
        : null;
      const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning.slice(0, 400) : null;
      if (score === null) continue;

      await env.DB.prepare(
        `INSERT INTO user_job_scores (user_id, job_id, llm_score, llm_reasoning, scored_at, scoring_model)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, job_id) DO UPDATE SET
           llm_score = excluded.llm_score,
           llm_reasoning = excluded.llm_reasoning,
           scored_at = excluded.scored_at,
           scoring_model = excluded.scoring_model`,
      )
        .bind(userId, job.id, score, reasoning, new Date().toISOString(), SCORING_MODEL)
        .run();
      okCount++;
    } catch (err) {
      console.log(`[rescore] job ${job.id} failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  return jsonResponse(
    {
      ok: true,
      scored: okCount,
      batch: jobs.length,
      has_more: jobs.length === SCORE_BATCH_LIMIT,
      tier,
      usage: { used: usage.used, remaining: usage.remaining, limit: usage.limit },
    },
    200,
  );
}

// ─── /api/jobs/:id/cover-letter ─────────────────────────────────────────────

const COVER_LETTER_MODEL = "@cf/meta/llama-3.1-8b-instruct";

async function coverLetter(env: Env, userId: string, jobId: string): Promise<Response> {
  // Tier-gated daily limit before any work.
  const tier = await fetchTier(env, userId);
  const usage = await checkAndConsume(env, userId, "cover_letter", tier);
  if (!usage.ok) {
    return jsonResponse(
      {
        ok: false,
        error:
          tier === "free"
            ? `You've used your ${usage.limit} free cover letters for today. Upgrade for ${limitFor("cover_letter", "sponsor")} per day.`
            : `You've reached your ${usage.limit} cover letters for today. Resets at UTC midnight.`,
        tier,
        usage: { used: usage.used, remaining: 0, limit: usage.limit },
      },
      429,
    );
  }

  const profile = await env.DB.prepare(
    `SELECT resume_text FROM user_profiles WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ resume_text: string | null }>();
  const resume = (profile?.resume_text || "").trim();
  if (resume.length < 50) {
    // Refund the used count if we couldn't actually generate.
    await env.DB.prepare(
      `UPDATE user_usage SET count = MAX(0, count - 1) WHERE user_id = ? AND action = ? AND day = ?`,
    )
      .bind(userId, "cover_letter", new Date().toISOString().slice(0, 10))
      .run();
    return jsonResponse({ ok: false, error: "Save your resume first." }, 400);
  }

  const job = await env.DB.prepare(
    `SELECT title, company, location, description_full, description_snippet
       FROM jobs WHERE id = ?`,
  )
    .bind(jobId)
    .first<{
      title: string;
      company: string;
      location: string | null;
      description_full: string | null;
      description_snippet: string | null;
    }>();
  if (!job) return jsonResponse({ ok: false, error: "job not found" }, 404);

  const description = (job.description_full || job.description_snippet || "").slice(0, 4000);
  try {
    const response = (await env.AI.run(COVER_LETTER_MODEL, {
      messages: [
        {
          role: "system",
          content:
            "You write concise, specific cover letters. 3 short paragraphs max, no fluff, no clichés. " +
            "Reference real experience from the resume and real requirements from the job. " +
            "Return ONLY the letter body — no greeting line, no signature, no markdown.",
        },
        {
          role: "user",
          content:
            `Candidate resume:\n${resume.slice(0, 4000)}\n\n` +
            `Job:\n${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}\n\n${description}\n\n` +
            `Write the cover letter.`,
        },
      ],
      max_tokens: 800,
      temperature: 0.4,
    } as Parameters<typeof env.AI.run>[1])) as { response?: string };
    const text = (response.response || "").trim();
    if (!text) return jsonResponse({ ok: false, error: "empty model response" }, 502);
    return jsonResponse(
      {
        ok: true,
        cover_letter: text,
        model: COVER_LETTER_MODEL,
        tier,
        usage: { used: usage.used, remaining: usage.remaining, limit: usage.limit },
      },
      200,
    );
  } catch (err) {
    return jsonResponse(
      { ok: false, error: `LLM call failed: ${err instanceof Error ? err.message : String(err)}` },
      502,
    );
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

interface JobOutShape {
  id: string;
  company: string;
  title: string;
  location: string | null;
  department: string | null;
  url: string;
  description_snippet: string | null;
  description_full: string | null;
  category: string | null;
  ats_type: string | null;
  remote: boolean;
  llm_score: number | null;
  llm_reasoning: string | null;
  first_seen_at: string;
  last_seen_at: string;
  expired: boolean;
  dismissed: boolean;
  pipeline_stage: string | null;
}

function jobRowToOut(row: any): JobOutShape {
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    location: row.location ?? null,
    department: row.department ?? null,
    url: row.url,
    description_snippet: row.description_snippet ?? null,
    description_full: row.description_full ?? null,
    category: row.category ?? null,
    ats_type: row.ats_type ?? null,
    remote: row.remote === 1 || row.remote === true,
    llm_score: row.llm_score ?? null,
    llm_reasoning: row.llm_reasoning ?? null,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    expired: row.expired === 1 || row.expired === true,
    dismissed: row.dismissed === 1 || row.dismissed === true || false,
    pipeline_stage: row.pipeline_stage ?? null,
  };
}

function pipelineRowToOut(row: any) {
  return {
    id: row.id as number,
    job_id: row.job_id as string,
    stage: row.stage as string,
    applied_at: row.applied_at as string | null,
    notes: row.notes as string | null,
    contact_name: row.contact_name as string | null,
    contact_email: row.contact_email as string | null,
    contact_role: row.contact_role as string | null,
    next_step: row.next_step as string | null,
    next_step_date: row.next_step_date as string | null,
    salary_offered: row.salary_offered as number | null,
    cover_letter: row.cover_letter as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    company: row.company as string,
    title: row.title as string,
    location: row.location as string | null,
    url: row.url as string,
    category: row.category as string | null,
    remote: row.remote === 1 || row.remote === true,
    first_seen_at: row.first_seen_at as string,
    last_seen_at: row.last_seen_at as string,
    llm_score: row.llm_score as number | null,
    llm_reasoning: row.llm_reasoning as string | null,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
