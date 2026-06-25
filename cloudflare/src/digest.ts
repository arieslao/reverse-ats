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

const TOP_N = 8;              // matches surfaced per user per day
const MIN_COVERAGE = 50;      // skip anything below this requirement coverage
const CANDIDATE_LIMIT = 1500; // recent structured jobs scanned per user
const MAX_USERS = 50;         // safety cap per run
const FROM = "Reverse ATS <reverse-ats@arieslabs.ai>";
const APP_URL = "https://reverse-ats.app";

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

  // Email the digest (best-effort; never throws out of the cron).
  const email = await fetchEmail(env, userId);
  if (email && env.RESEND_API_KEY) {
    const sent = await sendDigestEmail(env, email, today, top);
    if (sent) {
      await env.DB.prepare(`UPDATE daily_matches SET emailed = 1 WHERE user_id = ? AND match_date = ?`)
        .bind(userId, today)
        .run();
    }
  }
}

// ─── email ──────────────────────────────────────────────────────────────────

async function sendDigestEmail(env: Env, to: string, dateStr: string, matches: DigestMatch[]): Promise<boolean> {
  const rows = matches
    .map((m) => {
      const strengths = m.strengths.length
        ? `<div style="margin-top:6px"><span style="color:#16a34a;font-weight:600;font-size:12px">Strengths:</span> <span style="color:#444;font-size:12px">${esc(m.strengths.join(", "))}</span></div>`
        : "";
      const gaps = m.gaps.length
        ? `<div style="margin-top:2px"><span style="color:#ca8a04;font-weight:600;font-size:12px">Gaps:</span> <span style="color:#444;font-size:12px">${esc(m.gaps.join(", "))}</span></div>`
        : "";
      return `
        <tr><td style="padding:14px 0;border-bottom:1px solid #eee">
          <div>
            <span style="font-weight:600;font-size:15px;color:#111">${esc(m.title)}</span>
            <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;background:#dcfce7;color:#16a34a;font-size:12px;font-weight:600">${m.fit_score}% fit · ${m.coverage_pct}% skills</span>
          </div>
          <div style="color:#666;font-size:13px;margin-top:2px">${esc(m.company)}${m.location ? " · " + esc(m.location) : ""}</div>
          ${strengths}${gaps}
          <div style="margin-top:8px">
            <a href="${esc(m.url)}" style="font-size:13px;color:#2563eb;text-decoration:none">Open posting →</a>
            <a href="${APP_URL}/app/matches" style="font-size:13px;color:#2563eb;text-decoration:none;margin-left:14px">Tailor résumé & apply →</a>
          </div>
        </td></tr>`;
    })
    .join("");

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px">
    <h1 style="font-size:20px;color:#111;margin:0 0 4px">Your top ${matches.length} job matches</h1>
    <p style="color:#666;font-size:14px;margin:0 0 16px">${dateStr} · ranked by fit to your skills & experience</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <div style="margin-top:20px">
      <a href="${APP_URL}/app/matches" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:8px">View all matches in Reverse ATS</a>
    </div>
    <p style="color:#999;font-size:12px;margin-top:20px">Matched against your inventory. Strengths = required skills you have; gaps = what's missing. Tailored résumé + cover letter are one click away in the app.</p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        subject: `${matches.length} new job matches for you — ${dateStr}`,
        html,
      }),
    });
    if (!res.ok) {
      console.log(`[digest] resend failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.log(`[digest] resend error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
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

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
