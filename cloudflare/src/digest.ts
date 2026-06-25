// Daily best-fit match digest — Phase 5.
//
// Once a day (cron) we compute each user's top NEW job matches against their
// inventory, weighted by their stated preferences (remote, seniority), store
// them in daily_matches, and email a digest. The in-app "Daily Matches" tab
// reads the same precomputed rows via GET /api/matches.
//
// Each job is surfaced to a user at most once (we skip jobs already in any
// prior daily_matches row), so the digest is genuinely "new fits", not a
// re-rank of the whole feed.

import type { Env } from "./schema";
import { cosine, unpackVector } from "./embed";
import { buildUserSkillIndex, computeMatchBreakdown, type MatchBreakdown } from "./match";
import { verifyRequest, fetchEmail } from "./supabase-auth";

// The Worker only COMPUTES + stores matches. The GX10 lane (free local Qwen3.6)
// pulls them via /digest/batch, generates the tailored docs with python-docx,
// and emails the digest. So no LLM / docx / email lives in the Worker.
const TOP_N = 25;             // matches stored per user per day (covers the ≥90% set)
const MIN_COVERAGE = 50;      // skip anything below this requirement coverage
const CANDIDATE_LIMIT = 1500; // recent structured jobs scanned per user
const MAX_USERS = 50;         // safety cap per run

interface DigestMatch {
  job_id: string;
  company: string;
  title: string;
  url: string;
  location: string | null;
  fit_score: number;
  coverage_pct: number;
  strengths: string[];
  gaps: string[];
}

// ─── cron entrypoint ────────────────────────────────────────────────────────

export async function runDailyDigest(env: Env): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const users = await env.DB.prepare(
    `SELECT DISTINCT user_id FROM user_inventory LIMIT ?`,
  )
    .bind(MAX_USERS)
    .all<{ user_id: string }>();

  for (const { user_id } of users.results || []) {
    try {
      await digestForUser(env, user_id, today);
    } catch (err) {
      console.log(`[digest] user ${user_id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function digestForUser(env: Env, userId: string, today: string): Promise<void> {
  const inv = await loadInventoryIndex(env, userId);
  if (!inv) return; // no skills yet → nothing to match

  const profile = await env.DB.prepare(
    `SELECT remote_only, resume_embedding FROM user_profiles WHERE user_id = ?`,
  )
    .bind(userId)
    .first<{ remote_only: number | null; resume_embedding: ArrayBuffer | null }>();
  const prefersRemote = profile?.remote_only === 1;
  const resumeVec = profile?.resume_embedding ? unpackVector(profile.resume_embedding) : null;

  const candidates = await env.DB.prepare(
    `SELECT j.id, j.company, j.title, j.url, j.location, j.remote, j.workplace_type,
            st.must_have_skills, st.nice_to_have_skills, st.years_experience_min, st.seniority,
            e.embedding AS job_embedding
       FROM jobs j
       JOIN jobs_structured st ON st.job_id = j.id AND st.preprocess_error IS NULL
       LEFT JOIN jobs_embeddings e ON e.job_id = j.id
      WHERE j.expired = 0
        AND NOT EXISTS (SELECT 1 FROM user_dismissed d WHERE d.user_id = ? AND d.job_id = j.id)
        AND NOT EXISTS (SELECT 1 FROM user_pipeline  p WHERE p.user_id = ? AND p.job_id = j.id)
        AND NOT EXISTS (SELECT 1 FROM daily_matches  m WHERE m.user_id = ? AND m.job_id = j.id)
      ORDER BY j.first_seen_at DESC
      LIMIT ?`,
  )
    .bind(userId, userId, userId, CANDIDATE_LIMIT)
    .all();

  const scored: DigestMatch[] = [];
  for (const row of (candidates.results || []) as any[]) {
    // Exclude clearly-junior roles for a senior candidate.
    const sen = (row.seniority || "").toLowerCase();
    if (sen === "junior" || sen === "intern") continue;

    const bd: MatchBreakdown = computeMatchBreakdown(
      {
        must_have_skills: parseArr(row.must_have_skills),
        nice_to_have_skills: parseArr(row.nice_to_have_skills),
        years_experience_min: typeof row.years_experience_min === "number" ? row.years_experience_min : null,
      },
      inv,
    );
    if (bd.coverage_pct < MIN_COVERAGE) continue;

    // Preference-weighted fit score.
    let fit = bd.coverage_pct;
    const isRemote = row.remote === 1 || /remote/i.test(row.workplace_type || "");
    if (prefersRemote) fit += isRemote ? 10 : -18; // strongly favor remote when preferred
    if (resumeVec && row.job_embedding) {
      fit += Math.max(0, cosine(resumeVec, unpackVector(row.job_embedding))) * 10; // small semantic bump
    }
    fit = Math.max(0, Math.min(100, Math.round(fit)));

    scored.push({
      job_id: row.id,
      company: row.company,
      title: row.title,
      url: row.url,
      location: row.location ?? null,
      fit_score: fit,
      coverage_pct: bd.coverage_pct,
      strengths: bd.strengths.slice(0, 6),
      gaps: bd.gaps.slice(0, 6),
    });
  }

  scored.sort((a, b) => b.fit_score - a.fit_score || b.coverage_pct - a.coverage_pct);
  const top = scored.slice(0, TOP_N);
  if (top.length === 0) return;

  // Idempotent: clear today's rows, then insert the fresh ranking.
  await env.DB.prepare(`DELETE FROM daily_matches WHERE user_id = ? AND match_date = ?`)
    .bind(userId, today)
    .run();
  const now = new Date().toISOString();
  for (let i = 0; i < top.length; i++) {
    const m = top[i];
    await env.DB.prepare(
      `INSERT INTO daily_matches
         (user_id, job_id, match_date, fit_score, coverage_pct, rank, reasons, emailed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
      .bind(userId, m.job_id, today, m.fit_score, m.coverage_pct, i + 1, JSON.stringify({ strengths: m.strengths, gaps: m.gaps }), now)
      .run();
  }
  // Email is sent by the GX10 lane (see handleDigestBatch), not here.
}

// ─── GET /digest/batch (server-to-server, GX10 lane) ────────────────────────
//
// Returns everything the GX10 digest script needs to generate + email the day's
// docs entirely on the local model: each user's email, their inventory, and the
// day's stored matches with job text + required skills. Bearer INGEST_SECRET
// (same secret the scrape/preprocess lanes already use). Read-only.

export async function handleDigestBatch(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("authorization") || "";
  if (!env.INGEST_SECRET || auth !== `Bearer ${env.INGEST_SECRET}`) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const url = new URL(request.url);
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);

  const userRows = await env.DB.prepare(
    `SELECT DISTINCT user_id FROM daily_matches WHERE match_date = ?`,
  )
    .bind(date)
    .all<{ user_id: string }>();

  const users: any[] = [];
  for (const { user_id } of userRows.results || []) {
    const inv = await env.DB.prepare(
      `SELECT skills, experience, education, certifications, summary FROM user_inventory WHERE user_id = ?`,
    )
      .bind(user_id)
      .first<any>();
    const email = await fetchEmail(env, user_id);

    const matchRows = await env.DB.prepare(
      `SELECT m.job_id, m.fit_score, m.coverage_pct, m.rank, m.reasons,
              j.title, j.company, j.location, j.url, j.description_full, j.description_snippet,
              st.must_have_skills, st.nice_to_have_skills, st.years_experience_min
         FROM daily_matches m
         JOIN jobs j ON j.id = m.job_id
         LEFT JOIN jobs_structured st ON st.job_id = j.id
        WHERE m.user_id = ? AND m.match_date = ?
        ORDER BY m.rank ASC`,
    )
      .bind(user_id, date)
      .all();

    const matches = (matchRows.results || []).map((r: any) => {
      let reasons: any = {};
      try { reasons = JSON.parse(r.reasons || "{}"); } catch { reasons = {}; }
      return {
        job_id: r.job_id,
        title: r.title,
        company: r.company,
        location: r.location ?? null,
        url: r.url,
        fit_score: r.fit_score,
        coverage_pct: r.coverage_pct,
        rank: r.rank,
        strengths: reasons.strengths || [],
        gaps: reasons.gaps || [],
        description: (r.description_full || r.description_snippet || "").slice(0, 3500),
        required_skills: parseArr(r.must_have_skills),
        nice_skills: parseArr(r.nice_to_have_skills),
        years_required: typeof r.years_experience_min === "number" ? r.years_experience_min : null,
      };
    });

    users.push({
      user_id,
      email,
      inventory: inv
        ? {
            skills: safeParse(inv.skills),
            experience: safeParse(inv.experience),
            education: safeParse(inv.education),
            certifications: safeParse(inv.certifications),
            summary: inv.summary ?? null,
          }
        : null,
      matches,
    });
  }

  return json({ ok: true, date, users }, 200);
}

function safeParse(raw: unknown): any {
  if (typeof raw !== "string" || !raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// ─── GET /api/matches (in-app tab) ──────────────────────────────────────────

export async function handleMatches(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/matches" && url.pathname !== "/api/matches/run") return null;
  const identity = await verifyRequest(request, env);
  if (!identity) return json({ ok: false, error: "unauthorized" }, 401);

  // Manual "compute my matches now" — recomputes + emails just this user.
  if (url.pathname === "/api/matches/run" && request.method === "POST") {
    const today = new Date().toISOString().slice(0, 10);
    try {
      await digestForUser(env, identity.userId, today);
    } catch (err) {
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
    // fall through to return the freshly-computed set
  } else if (request.method !== "GET") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  // Latest day that has matches for this user (today, or the most recent run).
  const latest = await env.DB.prepare(
    `SELECT MAX(match_date) AS d FROM daily_matches WHERE user_id = ?`,
  )
    .bind(identity.userId)
    .first<{ d: string | null }>();
  const date = url.searchParams.get("date") || latest?.d;
  if (!date) return json({ ok: true, date: null, matches: [] }, 200);

  const rows = await env.DB.prepare(
    `SELECT m.job_id, m.fit_score, m.coverage_pct, m.rank, m.reasons,
            j.company, j.title, j.url, j.location, j.category, j.remote, j.workplace_type,
            j.salary_min, j.salary_max, j.salary_currency, j.comp_summary
       FROM daily_matches m
       JOIN jobs j ON j.id = m.job_id
      WHERE m.user_id = ? AND m.match_date = ?
      ORDER BY m.rank ASC`,
  )
    .bind(identity.userId, date)
    .all();

  const matches = (rows.results || []).map((r: any) => {
    let reasons: { strengths?: string[]; gaps?: string[] } = {};
    try {
      reasons = JSON.parse(r.reasons || "{}");
    } catch {
      reasons = {};
    }
    return {
      job_id: r.job_id,
      company: r.company,
      title: r.title,
      url: r.url,
      location: r.location ?? null,
      category: r.category ?? null,
      remote: r.remote === 1,
      workplace_type: r.workplace_type ?? null,
      salary_min: r.salary_min ?? null,
      salary_max: r.salary_max ?? null,
      salary_currency: r.salary_currency ?? null,
      comp_summary: r.comp_summary ?? null,
      fit_score: r.fit_score,
      coverage_pct: r.coverage_pct,
      rank: r.rank,
      strengths: reasons.strengths || [],
      gaps: reasons.gaps || [],
    };
  });

  return json({ ok: true, date, matches }, 200);
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function loadInventoryIndex(env: Env, userId: string) {
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

function parseArr(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
