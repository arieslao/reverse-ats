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
import { cosine, unpackVector, WORKERS_AI_TEXT_MODEL } from "./embed";
import {
  buildUserSkillIndex,
  computeMatchBreakdown,
  type MatchBreakdown,
  type UserSkillIndex,
} from "./match";
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

// Blend weights for sort_by='score' when a resume embedding exists. Cosine
// covers the long tail (every embedded job ranks meaningfully); the LLM score
// refines the top once it arrives. When llm_score is missing we substitute
// the cosine score so unscored-but-relevant jobs aren't penalized.
const BLEND_COSINE_WEIGHT = 0.5;
const BLEND_LLM_WEIGHT = 0.5;

// When the user has a structured inventory, requirement coverage (deterministic
// gap match) joins the blend so jobs they're actually qualified for rank up.
const BLEND_COV_COSINE_WEIGHT = 0.4;
const BLEND_COV_LLM_WEIGHT = 0.25;
const BLEND_COV_COVERAGE_WEIGHT = 0.35;

// Loaded once per request: the user's skill index for the gap matcher. null
// when the user has no inventory yet (matcher is skipped, feed behaves as before).
async function loadUserSkillIndex(env: Env, userId: string): Promise<UserSkillIndex | null> {
  const row = await env.DB.prepare(
    `SELECT skills, total_years_experience FROM user_inventory WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ skills: string | null; total_years_experience: number | null }>();
  if (!row?.skills) return null;
  let skills: Array<{ name: string }> = [];
  try {
    const parsed = JSON.parse(row.skills);
    if (Array.isArray(parsed)) skills = parsed.filter((s) => s && typeof s.name === "string");
  } catch {
    return null;
  }
  if (skills.length === 0) return null;
  return buildUserSkillIndex(skills, row.total_years_experience ?? null);
}

// Parse a jobs_structured JSON column defensively.
function parseSkillArray(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Build the breakdown for one job row (which must carry the jobs_structured
// columns: must_have_skills, nice_to_have_skills, years_experience_min).
function breakdownForRow(row: any, idx: UserSkillIndex | null): MatchBreakdown | null {
  if (!idx) return null;
  // No structured row yet (still in the preprocessing backlog) → nothing to match.
  if (row.must_have_skills == null && row.nice_to_have_skills == null) return null;
  return computeMatchBreakdown(
    {
      must_have_skills: parseSkillArray(row.must_have_skills),
      nice_to_have_skills: parseSkillArray(row.nice_to_have_skills),
      years_experience_min:
        typeof row.years_experience_min === "number" ? row.years_experience_min : null,
    },
    idx,
  );
}

interface ProfileFilterRow {
  remote_only: number;
  blacklisted_companies: string | null;
  blacklisted_keywords: string | null;
  resume_embedding: ArrayBuffer | null;
}

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

  // /api/jobs/:id  and  /api/jobs/:id/(dismiss|save|cover-letter|tailored-resume)
  const jobMatch = path.match(
    /^\/api\/jobs\/([A-Za-z0-9_\-:.]+)(\/(dismiss|save|cover-letter|tailored-resume))?$/,
  );
  if (jobMatch) {
    const jobId = jobMatch[1];
    const action = jobMatch[3];
    if (!action && request.method === "GET") return getJob(env, userId, jobId);
    if (action === "dismiss" && request.method === "POST") return dismissJob(env, userId, jobId);
    if (action === "save" && request.method === "POST") return saveJobToPipeline(env, userId, jobId);
    if (action === "cover-letter" && request.method === "POST") return coverLetter(env, userId, jobId, request);
    if (action === "tailored-resume" && request.method === "POST") return tailoredResume(env, userId, jobId, request);
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
  const evtMatch = path.match(/^\/api\/pipeline\/(\d+)\/events$/);
  if (evtMatch && request.method === "GET") {
    return listPipelineEvents(env, userId, parseInt(evtMatch[1], 10));
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
  const explicitRemoteOnly = url.searchParams.get("remote_only") === "true";
  const sinceDays = parseInt(url.searchParams.get("since_days") || "0", 10) || 0;
  const sortBy = url.searchParams.get("sort_by") || "score";
  const locationsParam = url.searchParams.get("locations") || "";
  const locations = locationsParam ? locationsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

  // Load the small set of profile fields the feed auto-applies. Anything
  // strict (locations, salary, skills) stays opt-in via query params so the
  // user isn't surprised by zero-result feeds; the safe auto-applies are
  // remote_only and the blacklists.
  const profile = await env.DB.prepare(
    `SELECT remote_only, blacklisted_companies, blacklisted_keywords, resume_embedding
       FROM user_profiles WHERE user_id = ?`,
  )
    .bind(userId)
    .first<ProfileFilterRow>();

  const blacklistedCompanies = parseJsonArray(profile?.blacklisted_companies);
  const blacklistedKeywords = parseJsonArray(profile?.blacklisted_keywords);
  const remoteOnly = explicitRemoteOnly || profile?.remote_only === 1;

  // The gap matcher's skill index (null if no inventory yet). Used to attach a
  // per-job strengths/gaps breakdown and to fold requirement coverage into rank.
  const skillIdx = await loadUserSkillIndex(env, userId);

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
  if (blacklistedCompanies.length > 0) {
    const placeholders = blacklistedCompanies.map(() => "?").join(", ");
    where.push(`LOWER(j.company) NOT IN (${placeholders})`);
    for (const c of blacklistedCompanies) binds.push(c.toLowerCase());
  }
  for (const kw of blacklistedKeywords) {
    where.push("j.title NOT LIKE ?");
    binds.push(`%${kw}%`);
  }

  // Score filter (against per-user score; if none, fall back to 0).
  const scoreSelect = `COALESCE(s.llm_score, 0) AS llm_score, s.llm_reasoning AS llm_reasoning`;
  if (minScore > 0) {
    where.push("COALESCE(s.llm_score, 0) >= ?");
    binds.push(minScore);
  }

  const offset = (page - 1) * perPage;
  const whereSql = where.join(" AND ");

  // Cosine-blended sort path: only when the user has a resume embedding AND
  // they're using the default 'score' sort. Other sort modes stay in SQL.
  const useCosineRank = sortBy === "score" && profile?.resume_embedding != null;

  if (useCosineRank) {
    return listJobsCosineBlended(env, userId, {
      whereSql,
      binds,
      perPage,
      offset,
      resumeVector: unpackVector(profile.resume_embedding!),
      scoreSelect,
      skillIdx,
    });
  }

  const orderBy =
    sortBy === "newest" ? "j.first_seen_at DESC"
      : sortBy === "company" ? "j.company ASC, j.first_seen_at DESC"
      : "COALESCE(s.llm_score, 0) DESC, j.first_seen_at DESC";

  const total = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM jobs j
       LEFT JOIN user_job_scores s ON s.user_id = ? AND s.job_id = j.id
      WHERE ${whereSql}`,
  )
    .bind(userId, ...binds)
    .first<{ n: number }>();

  const rows = await env.DB.prepare(
    `SELECT
        j.id, j.company, j.title, j.url, j.location, j.department, j.team,
        j.description_snippet, j.description_full, j.category, j.ats_type,
        j.remote, j.first_seen_at, j.last_seen_at, j.expired,
        j.posted_at, j.fingerprint,
        j.employment_type, j.workplace_type,
        j.salary_min, j.salary_max, j.salary_currency, j.comp_summary,
        r.repost_count, r.repost_first_seen_at,
        st.must_have_skills, st.nice_to_have_skills, st.years_experience_min,
        ${scoreSelect}
       FROM jobs j
       LEFT JOIN user_job_scores s ON s.user_id = ? AND s.job_id = j.id
       LEFT JOIN jobs_structured st ON st.job_id = j.id
       LEFT JOIN (
         SELECT fingerprint,
                COUNT(*)         AS repost_count,
                MIN(first_seen_at) AS repost_first_seen_at
           FROM job_reposts
          GROUP BY fingerprint
       ) r ON r.fingerprint = j.fingerprint
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
  )
    .bind(userId, ...binds, perPage, offset)
    .all();

  const jobs = (rows.results || []).map((row) => jobRowToOut(row, skillIdx));

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

// ─── cosine-blended sort path ──────────────────────────────────────────────
//
// Two-stage retrieval: pull (job_id, embedding, llm_score) for every candidate
// passing the WHERE filters, compute cosine + blend in JS, sort globally, then
// fetch full rows for just the page. Scales to ~10K embedded candidates per
// request comfortably (each row is ~4 KB of vector + a few small columns).
//
// Jobs without an embedding get cosine = 0; they sink below any embedded
// match but still appear in pagination so the user can scroll past the
// already-ranked tier into the long tail.

interface CosineBlendedArgs {
  whereSql: string;
  binds: (string | number)[];
  perPage: number;
  offset: number;
  resumeVector: Float32Array;
  scoreSelect: string;
  skillIdx: UserSkillIndex | null;
}

async function listJobsCosineBlended(
  env: Env,
  userId: string,
  args: CosineBlendedArgs,
): Promise<Response> {
  const { whereSql, binds, perPage, offset, resumeVector, skillIdx } = args;
  const useCoverage = skillIdx != null;

  // Pull must_have_skills + years only when we'll actually use coverage in the
  // blend — keeps the candidate scan lean when there's no inventory.
  const covSelect = useCoverage
    ? ", st.must_have_skills AS must_have_skills, st.years_experience_min AS years_experience_min"
    : "";
  const covJoin = useCoverage ? "LEFT JOIN jobs_structured st ON st.job_id = j.id" : "";

  const candidates = await env.DB.prepare(
    `SELECT j.id,
            e.embedding AS job_embedding,
            COALESCE(s.llm_score, 0) AS llm_score${covSelect}
       FROM jobs j
       LEFT JOIN user_job_scores s ON s.user_id = ? AND s.job_id = j.id
       LEFT JOIN jobs_embeddings e ON e.job_id = j.id
       ${covJoin}
      WHERE ${whereSql}`,
  )
    .bind(userId, ...binds)
    .all<{
      id: string;
      job_embedding: ArrayBuffer | null;
      llm_score: number;
      must_have_skills?: string | null;
      years_experience_min?: number | null;
    }>();

  const ranked = (candidates.results || []).map((row) => {
    const cosineScore = row.job_embedding
      ? Math.max(0, cosine(resumeVector, unpackVector(row.job_embedding))) * 100
      : 0;
    const llmScore = row.llm_score || 0;
    // Substitute cosine when LLM hasn't scored this one yet, so an
    // unscored-but-relevant job ranks on cosine alone instead of getting
    // halved by the missing LLM weight.
    const effectiveLlm = llmScore > 0 ? llmScore : cosineScore;

    if (useCoverage && row.must_have_skills != null) {
      // Deterministic requirement coverage (0-100) joins the blend so jobs the
      // user is actually qualified for surface above merely-similar ones.
      const bd = computeMatchBreakdown(
        {
          must_have_skills: parseSkillArray(row.must_have_skills),
          nice_to_have_skills: [],
          years_experience_min:
            typeof row.years_experience_min === "number" ? row.years_experience_min : null,
        },
        skillIdx!,
      );
      const blended =
        BLEND_COV_COSINE_WEIGHT * cosineScore +
        BLEND_COV_LLM_WEIGHT * effectiveLlm +
        BLEND_COV_COVERAGE_WEIGHT * bd.coverage_pct;
      return { id: row.id, blended };
    }

    const blended = BLEND_COSINE_WEIGHT * cosineScore + BLEND_LLM_WEIGHT * effectiveLlm;
    return { id: row.id, blended };
  });

  ranked.sort((a, b) => b.blended - a.blended);

  const total = ranked.length;
  const pageIds = ranked.slice(offset, offset + perPage).map((r) => r.id);
  if (pageIds.length === 0) {
    return jsonResponse({ ok: true, jobs: [], total, page: Math.floor(offset / perPage) + 1, per_page: perPage }, 200);
  }

  const placeholders = pageIds.map(() => "?").join(", ");
  const rows = await env.DB.prepare(
    `SELECT
        j.id, j.company, j.title, j.url, j.location, j.department, j.team,
        j.description_snippet, j.description_full, j.category, j.ats_type,
        j.remote, j.first_seen_at, j.last_seen_at, j.expired,
        j.posted_at, j.fingerprint,
        j.employment_type, j.workplace_type,
        j.salary_min, j.salary_max, j.salary_currency, j.comp_summary,
        r.repost_count, r.repost_first_seen_at,
        st.must_have_skills, st.nice_to_have_skills, st.years_experience_min,
        COALESCE(s.llm_score, 0) AS llm_score, s.llm_reasoning AS llm_reasoning
       FROM jobs j
       LEFT JOIN user_job_scores s ON s.user_id = ? AND s.job_id = j.id
       LEFT JOIN jobs_structured st ON st.job_id = j.id
       LEFT JOIN (
         SELECT fingerprint,
                COUNT(*)         AS repost_count,
                MIN(first_seen_at) AS repost_first_seen_at
           FROM job_reposts
          GROUP BY fingerprint
       ) r ON r.fingerprint = j.fingerprint
      WHERE j.id IN (${placeholders})`,
  )
    .bind(userId, ...pageIds)
    .all();

  // Re-order the SQL results into the cosine-ranked sequence the page expects.
  const byId = new Map<string, ReturnType<typeof jobRowToOut>>();
  for (const row of rows.results || []) {
    const out = jobRowToOut(row, skillIdx);
    byId.set(out.id, out);
  }
  const jobs = pageIds
    .map((id) => byId.get(id))
    .filter((j): j is ReturnType<typeof jobRowToOut> => j !== undefined);

  return jsonResponse(
    { ok: true, jobs, total, page: Math.floor(offset / perPage) + 1, per_page: perPage },
    200,
  );
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function getJob(env: Env, userId: string, jobId: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT j.*,
            s.llm_score AS llm_score, s.llm_reasoning AS llm_reasoning,
            st.must_have_skills, st.nice_to_have_skills, st.years_experience_min,
            p.stage AS pipeline_stage,
            CASE WHEN d.job_id IS NOT NULL THEN 1 ELSE 0 END AS dismissed
       FROM jobs j
       LEFT JOIN user_job_scores s ON s.user_id = ? AND s.job_id = j.id
       LEFT JOIN jobs_structured st ON st.job_id = j.id
       LEFT JOIN user_pipeline   p ON p.user_id = ? AND p.job_id = j.id
       LEFT JOIN user_dismissed  d ON d.user_id = ? AND d.job_id = j.id
      WHERE j.id = ?`,
  )
    .bind(userId, userId, userId, jobId)
    .first();
  if (!row) return jsonResponse({ ok: false, error: "not found" }, 404);
  const skillIdx = await loadUserSkillIndex(env, userId);
  return jsonResponse({ ok: true, job: jobRowToOut(row, skillIdx) }, 200);
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
  const inserted = await env.DB.prepare(
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
    .first<{ id: number }>();

  // Log the initial 'saved' event only on first insert (changes > 0 means we actually inserted).
  if (row && inserted.meta.changes > 0) {
    await logPipelineEvent(env, userId, row.id, null, "saved", null, now);
  }
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

  // Capture the prior stage (if any) so we can log a transition event.
  const prior = await env.DB.prepare(
    `SELECT id, stage FROM user_pipeline WHERE user_id = ? AND job_id = ?`,
  )
    .bind(userId, jobId)
    .first<{ id: number; stage: string }>();

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
    .first<{ id: number }>();

  if (row) {
    if (!prior) {
      await logPipelineEvent(env, userId, row.id, null, stage, body.notes || null, now);
    } else if (prior.stage !== stage) {
      await logPipelineEvent(env, userId, row.id, prior.stage, stage, body.notes || null, now);
    }
  }
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
  let stageTransition: { from: string; to: string; note: string | null } | null = null;

  if ("stage" in body) {
    const s = body.stage;
    if (typeof s !== "string" || !PIPELINE_STAGES.has(s)) {
      return jsonResponse({ ok: false, error: "invalid stage" }, 400);
    }
    // Look up current stage so we can decide whether to log an event.
    const prior = await env.DB.prepare(
      `SELECT stage FROM user_pipeline WHERE id = ? AND user_id = ?`,
    )
      .bind(id, userId)
      .first<{ stage: string }>();
    if (prior && prior.stage !== s) {
      stageTransition = { from: prior.stage, to: s, note: typeof body.notes === "string" ? body.notes : null };
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

  if (stageTransition) {
    await logPipelineEvent(
      env,
      userId,
      id,
      stageTransition.from,
      stageTransition.to,
      stageTransition.note,
      new Date().toISOString(),
    );
  }

  const row = await env.DB.prepare(
    `SELECT p.*, j.company, j.title, j.url, j.location FROM user_pipeline p
       JOIN jobs j ON j.id = p.job_id WHERE p.id = ? AND p.user_id = ?`,
  )
    .bind(id, userId)
    .first();
  return jsonResponse({ ok: true, entry: row }, 200);
}

// ─── /api/pipeline/:id/events ──────────────────────────────────────────────

async function listPipelineEvents(env: Env, userId: string, pipelineId: number): Promise<Response> {
  // Confirm the pipeline row belongs to this user before exposing events.
  const owned = await env.DB.prepare(
    `SELECT 1 FROM user_pipeline WHERE id = ? AND user_id = ?`,
  )
    .bind(pipelineId, userId)
    .first();
  if (!owned) return jsonResponse({ ok: false, error: "not found" }, 404);

  const rows = await env.DB.prepare(
    `SELECT id, pipeline_id, from_stage, to_stage, note, created_at
       FROM pipeline_events
      WHERE pipeline_id = ? AND user_id = ?
      ORDER BY created_at ASC`,
  )
    .bind(pipelineId, userId)
    .all();
  return jsonResponse({ ok: true, events: rows.results || [] }, 200);
}

async function logPipelineEvent(
  env: Env,
  userId: string,
  pipelineId: number,
  fromStage: string | null,
  toStage: string,
  note: string | null,
  createdAt: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO pipeline_events (pipeline_id, user_id, from_stage, to_stage, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(pipelineId, userId, fromStage, toStage, note, createdAt)
    .run();
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

const SCORING_MODEL = WORKERS_AI_TEXT_MODEL;
const SCORE_BATCH_LIMIT = 25;

// Rank unscored, undismissed, non-expired jobs by cosine similarity to the
// user's resume embedding and return the top SCORE_BATCH_LIMIT. The embedded
// candidate set is currently a few hundred to a few thousand rows; pulling
// (id, embedding) into the worker and sorting in JS is fine at that scale.
async function pickRescoreTargetsByCosine(
  env: Env,
  userId: string,
  resumeEmbeddingBuf: ArrayBuffer,
): Promise<Array<{
  id: string;
  title: string;
  company: string;
  location: string | null;
  description_snippet: string | null;
}>> {
  const resumeVec = unpackVector(resumeEmbeddingBuf);

  const candidates = await env.DB.prepare(
    `SELECT j.id, e.embedding AS job_embedding
       FROM jobs j
       JOIN jobs_embeddings e ON e.job_id = j.id
      WHERE j.expired = 0
        AND NOT EXISTS (SELECT 1 FROM user_job_scores s WHERE s.user_id = ? AND s.job_id = j.id)
        AND NOT EXISTS (SELECT 1 FROM user_dismissed d WHERE d.user_id = ? AND d.job_id = j.id)`,
  )
    .bind(userId, userId)
    .all<{ id: string; job_embedding: ArrayBuffer }>();

  const ranked = (candidates.results || [])
    .map((row) => ({ id: row.id, sim: cosine(resumeVec, unpackVector(row.job_embedding)) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, SCORE_BATCH_LIMIT);

  if (ranked.length === 0) return [];

  const ids = ranked.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await env.DB.prepare(
    `SELECT j.id, j.title, j.company, j.location, j.description_snippet
       FROM jobs j WHERE j.id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<{
      id: string;
      title: string;
      company: string;
      location: string | null;
      description_snippet: string | null;
    }>();

  // Preserve cosine order in the output (SQL IN doesn't guarantee it).
  const byId = new Map(rows.results?.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);
}

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
    `SELECT resume_text, target_roles, must_have_skills, resume_embedding
       FROM user_profiles WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{
      resume_text: string | null;
      target_roles: string;
      must_have_skills: string;
      resume_embedding: ArrayBuffer | null;
    }>();
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

  // Pick jobs to score. With a resume embedding, rank candidates by cosine
  // and spend the daily quota on the most-relevant unscored jobs. Without
  // one (resume too short to embed, or model failed), fall back to the
  // legacy newest-first selection.
  let jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    description_snippet: string | null;
  }>;

  if (profile?.resume_embedding) {
    jobs = await pickRescoreTargetsByCosine(env, userId, profile.resume_embedding);
  } else {
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
    jobs = (targets.results || []) as typeof jobs;
  }

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

const COVER_LETTER_MODEL = WORKERS_AI_TEXT_MODEL;

type CoverLetterStyle = "concise" | "standard" | "detailed";

const COVER_LETTER_STYLES: Record<
  CoverLetterStyle,
  { systemPrompt: string; userInstruction: string; maxTokens: number }
> = {
  concise: {
    systemPrompt:
      "You write tight, high-signal cover letters. 2 short paragraphs, ~150 words total, no fluff, no clichés. " +
      "Reference real experience from the resume and real requirements from the job. " +
      "Return ONLY the letter body — no greeting line, no signature, no markdown.",
    userInstruction: "Write a concise 2-paragraph cover letter (~150 words).",
    maxTokens: 400,
  },
  standard: {
    systemPrompt:
      "You write concise, specific cover letters. 3 short paragraphs (~300 words), no fluff, no clichés. " +
      "Reference real experience from the resume and real requirements from the job. " +
      "Return ONLY the letter body — no greeting line, no signature, no markdown.",
    userInstruction: "Write a 3-paragraph cover letter (~300 words).",
    maxTokens: 800,
  },
  detailed: {
    systemPrompt:
      "You write thorough, specific cover letters. 4 paragraphs (~450 words) with concrete accomplishments and quantified impact. " +
      "Reference real experience from the resume and real requirements from the job. " +
      "Return ONLY the letter body — no greeting line, no signature, no markdown.",
    userInstruction:
      "Write a detailed 4-paragraph cover letter (~450 words) with concrete accomplishments and quantified impact.",
    maxTokens: 1200,
  },
};

function parseStyle(value: unknown): CoverLetterStyle {
  return value === "concise" || value === "detailed" ? value : "standard";
}

async function coverLetter(env: Env, userId: string, jobId: string, request: Request): Promise<Response> {
  let style: CoverLetterStyle = "standard";
  if (request.method === "POST") {
    try {
      const body = (await request.clone().json().catch(() => null)) as { style?: unknown } | null;
      if (body && body.style !== undefined) style = parseStyle(body.style);
    } catch {
      // body optional; default style stands
    }
  }
  const styleConfig = COVER_LETTER_STYLES[style];

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
        { role: "system", content: styleConfig.systemPrompt },
        {
          role: "user",
          content:
            `Candidate resume:\n${resume.slice(0, 4000)}\n\n` +
            `Job:\n${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}\n\n${description}\n\n` +
            styleConfig.userInstruction,
        },
      ],
      max_tokens: styleConfig.maxTokens,
      temperature: 0.4,
    } as Parameters<typeof env.AI.run>[1])) as { response?: string };
    const text = (response.response || "").trim();
    if (!text) return jsonResponse({ ok: false, error: "empty model response" }, 502);
    return jsonResponse(
      {
        ok: true,
        cover_letter: text,
        model: COVER_LETTER_MODEL,
        style,
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

// ─── /api/jobs/:id/tailored-resume ──────────────────────────────────────────
//
// Generates a job-tailored résumé as STRUCTURED JSON (the browser turns it into
// a .docx). Pulls from the structured inventory when present (richer than the
// freeform resume_text) and uses the Phase-3 gap breakdown to foreground the
// skills the job actually asks for and mirror its keywords for ATS parsing.

const TAILORED_RESUME_MODEL = WORKERS_AI_TEXT_MODEL;

const TAILORED_RESUME_SYSTEM_PROMPT = `You are an expert résumé writer tailoring a candidate's résumé to ONE specific job.

You are given the candidate's structured inventory (skills, work history, education) and the target job (title, company, required + nice-to-have skills). Produce a tailored résumé that:
- leads with a 2-3 sentence summary aimed squarely at THIS role
- orders skills so the job's required/nice-to-have skills the candidate HAS appear first; mirror the job's exact wording for ATS keyword matching
- rewrites each role's bullets to foreground experience relevant to this job, quantified where the source gives numbers
- NEVER invents skills, employers, titles, dates, or metrics not present in the inventory — only reframes what's there

Return ONLY valid JSON in this shape:

{
  "headline": "<target-role-aligned headline>",
  "summary": "<2-3 sentence pitch for THIS job>",
  "skills": ["<skill>", ...],
  "experience": [
    {"company": "<name>", "title": "<title>", "dates": "<start – end>", "bullets": ["<tailored bullet>", ...]}
  ],
  "education": ["<degree, school, year>", ...],
  "certifications": ["<cert>", ...]
}

Output JSON only — no prose, no markdown fences.`;

const TAILORED_RESUME_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    skills: { type: "array", items: { type: "string" } },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          dates: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title", "bullets"],
      },
    },
    education: { type: "array", items: { type: "string" } },
    certifications: { type: "array", items: { type: "string" } },
  },
  required: ["headline", "summary", "skills", "experience"],
};

async function tailoredResume(env: Env, userId: string, jobId: string, _request: Request): Promise<Response> {
  const tier = await fetchTier(env, userId);
  const usage = await checkAndConsume(env, userId, "tailored_resume", tier);
  if (!usage.ok) {
    return jsonResponse(
      {
        ok: false,
        error:
          tier === "free"
            ? `You've used your ${usage.limit} tailored résumés for today. Upgrade for ${limitFor("tailored_resume", "sponsor")} per day.`
            : `You've reached your ${usage.limit} tailored résumés for today. Resets at UTC midnight.`,
        tier,
        usage: { used: usage.used, remaining: 0, limit: usage.limit },
      },
      429,
    );
  }

  const refund = async () => {
    await env.DB.prepare(
      `UPDATE user_usage SET count = MAX(0, count - 1) WHERE user_id = ? AND action = ? AND day = ?`,
    )
      .bind(userId, "tailored_resume", new Date().toISOString().slice(0, 10))
      .run();
  };

  // Prefer the structured inventory; fall back to freeform resume_text.
  const inv = await env.DB.prepare(
    `SELECT skills, experience, education, certifications, summary FROM user_inventory WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ skills: string; experience: string; education: string; certifications: string; summary: string | null }>();
  const profile = await env.DB.prepare(`SELECT resume_text FROM user_profiles WHERE user_id = ?`)
    .bind(userId)
    .first<{ resume_text: string | null }>();

  const inventoryText = inv ? buildInventoryDigest(inv) : "";
  const resumeText = (profile?.resume_text || "").trim();
  const candidateBlock = inventoryText || resumeText;
  if (candidateBlock.length < 50) {
    await refund();
    return jsonResponse(
      { ok: false, error: "Build your Skills & Experience inventory (or save a résumé) first." },
      400,
    );
  }

  const job = await env.DB.prepare(
    `SELECT j.title, j.company, j.location, j.description_full, j.description_snippet,
            st.must_have_skills, st.nice_to_have_skills, st.years_experience_min
       FROM jobs j LEFT JOIN jobs_structured st ON st.job_id = j.id
      WHERE j.id = ?`,
  )
    .bind(jobId)
    .first<{
      title: string;
      company: string;
      location: string | null;
      description_full: string | null;
      description_snippet: string | null;
      must_have_skills: string | null;
      nice_to_have_skills: string | null;
      years_experience_min: number | null;
    }>();
  if (!job) {
    await refund();
    return jsonResponse({ ok: false, error: "job not found" }, 404);
  }

  const required = parseSkillArray(job.must_have_skills);
  const nice = parseSkillArray(job.nice_to_have_skills);
  const description = (job.description_full || job.description_snippet || "").slice(0, 3000);

  const userPrompt =
    `## Candidate inventory\n${candidateBlock.slice(0, 5000)}\n\n` +
    `## Target job\n${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}\n` +
    (required.length ? `Required skills: ${required.join(", ")}\n` : "") +
    (nice.length ? `Nice-to-have: ${nice.join(", ")}\n` : "") +
    `\n${description}\n\n` +
    `Produce the tailored résumé JSON per the system instructions.`;

  let parsed: any = null;
  try {
    const response = (await env.AI.run(TAILORED_RESUME_MODEL, {
      messages: [
        { role: "system", content: TAILORED_RESUME_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2500,
      temperature: 0.3,
      response_format: { type: "json_schema", json_schema: TAILORED_RESUME_SCHEMA },
    } as Parameters<typeof env.AI.run>[1])) as { response?: unknown };
    const r = response.response;
    if (r && typeof r === "object") parsed = r;
    else if (typeof r === "string") parsed = parseJsonLooseLocal(r);
  } catch (err) {
    await refund();
    return jsonResponse(
      { ok: false, error: `LLM call failed: ${err instanceof Error ? err.message : String(err)}` },
      502,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    await refund();
    return jsonResponse({ ok: false, error: "Model returned unparseable résumé. Try again." }, 502);
  }

  return jsonResponse(
    {
      ok: true,
      resume: parsed,
      job: { title: job.title, company: job.company },
      model: TAILORED_RESUME_MODEL,
      tier,
      usage: { used: usage.used, remaining: usage.remaining, limit: usage.limit },
    },
    200,
  );
}

// Compact text digest of the structured inventory for the résumé prompt.
function buildInventoryDigest(inv: {
  skills: string;
  experience: string;
  education: string;
  certifications: string;
  summary: string | null;
}): string {
  const skills = safeJson<Array<{ name: string }>>(inv.skills, []);
  const exp = safeJson<Array<{ company: string; title: string; start?: string; end?: string; highlights?: string[] }>>(inv.experience, []);
  const edu = safeJson<Array<{ degree?: string; field?: string; school: string; end?: string }>>(inv.education, []);
  const certs = safeJson<Array<{ name: string; issuer?: string }>>(inv.certifications, []);
  const lines: string[] = [];
  if (inv.summary) lines.push(`Summary: ${inv.summary}`);
  if (skills.length) lines.push(`Skills: ${skills.map((s) => s.name).join(", ")}`);
  if (exp.length) {
    lines.push("Experience:");
    for (const e of exp) {
      lines.push(`- ${e.title} at ${e.company} (${e.start || "?"} – ${e.end || "Present"})`);
      for (const h of e.highlights || []) lines.push(`  • ${h}`);
    }
  }
  if (edu.length) lines.push("Education: " + edu.map((e) => `${e.degree || ""} ${e.field || ""} ${e.school} ${e.end || ""}`.trim()).join("; "));
  if (certs.length) lines.push("Certifications: " + certs.map((c) => c.name).join(", "));
  return lines.join("\n");
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseJsonLooseLocal(text: string): unknown {
  if (!text) return null;
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

interface JobOutShape {
  id: string;
  company: string;
  title: string;
  location: string | null;
  department: string | null;
  team: string | null;
  url: string;
  description_snippet: string | null;
  description_full: string | null;
  category: string | null;
  ats_type: string | null;
  remote: boolean;
  employment_type: string | null;
  workplace_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  comp_summary: string | null;
  llm_score: number | null;
  llm_reasoning: string | null;
  first_seen_at: string;
  last_seen_at: string;
  posted_at: string | null;
  repost_count: number;
  repost_first_seen_at: string | null;
  expired: boolean;
  dismissed: boolean;
  pipeline_stage: string | null;
  match_breakdown?: MatchBreakdown | null;
}

function jobRowToOut(row: any, skillIdx: UserSkillIndex | null = null): JobOutShape {
  const repostCount = typeof row.repost_count === "number" ? row.repost_count : 0;
  return {
    match_breakdown: breakdownForRow(row, skillIdx),
    id: row.id,
    company: row.company,
    title: row.title,
    location: row.location ?? null,
    department: row.department ?? null,
    team: row.team ?? null,
    url: row.url,
    description_snippet: row.description_snippet ?? null,
    description_full: row.description_full ?? null,
    category: row.category ?? null,
    ats_type: row.ats_type ?? null,
    remote: row.remote === 1 || row.remote === true,
    employment_type: row.employment_type ?? null,
    workplace_type: row.workplace_type ?? null,
    salary_min: typeof row.salary_min === "number" ? row.salary_min : null,
    salary_max: typeof row.salary_max === "number" ? row.salary_max : null,
    salary_currency: row.salary_currency ?? null,
    comp_summary: row.comp_summary ?? null,
    llm_score: row.llm_score ?? null,
    llm_reasoning: row.llm_reasoning ?? null,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    posted_at: row.posted_at ?? null,
    repost_count: repostCount,
    repost_first_seen_at: row.repost_first_seen_at ?? null,
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
