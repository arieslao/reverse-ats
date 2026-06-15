// Admin endpoints — list users, change tiers.
// All routes here are gated to the admin tier via requireTier.

import type { Env, AuthedUser } from "./schema";
import { requireTier } from "./supabase-auth";

const ALLOWED_TIERS = new Set<AuthedUser["tier"]>(["free", "sponsor", "admin"]);

/**
 * Route any /admin/* request. Returns null if the path is not admin-owned,
 * letting the parent router fall through to 404.
 */
export async function handleAdmin(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/admin/")) return null;

  // Read-only automation path: GET /admin/scrape-health also accepts a dedicated
  // bearer token (SCRAPE_HEALTH_TOKEN) so unattended monitors can poll it without
  // an expiring admin JWT. Scoped to THIS one read-only endpoint — every other
  // /admin/* route still requires admin tier via requireTier below. Mirrors the
  // shared-secret pattern used by POST /ingest.
  if (request.method === "GET" && url.pathname === "/admin/scrape-health") {
    const auth = request.headers.get("authorization") || "";
    if (env.SCRAPE_HEALTH_TOKEN && auth === `Bearer ${env.SCRAPE_HEALTH_TOKEN}`) {
      return scrapeHealth(env, url);
    }
  }

  // Every admin route requires admin tier.
  const userOrError = await requireTier(request, env, "admin");
  if (userOrError instanceof Response) return userOrError;

  if (request.method === "GET" && url.pathname === "/admin/users") {
    return listUsers(env);
  }

  const userIdMatch = url.pathname.match(/^\/admin\/users\/([0-9a-f-]{36})$/i);
  if (userIdMatch) {
    const userId = userIdMatch[1];
    if (request.method === "PATCH") return updateUser(request, env, userId);
  }

  if (request.method === "GET" && url.pathname === "/admin/scrape-health") {
    return scrapeHealth(env, url);
  }

  return jsonResponse({ ok: false, error: "not found" }, 404);
}

// ─── GET /admin/users ──────────────────────────────────────────────────────

async function listUsers(env: Env): Promise<Response> {
  const url = `${env.SUPABASE_URL}/rest/v1/profiles?select=id,email,tier,created_at&order=created_at.desc`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    return jsonResponse({ ok: false, error: `supabase ${res.status}: ${await res.text()}` }, 502);
  }
  const users = await res.json();
  return jsonResponse({ ok: true, users }, 200);
}

// ─── PATCH /admin/users/:id ────────────────────────────────────────────────
// Body: { tier: 'free' | 'sponsor' | 'admin' }

async function updateUser(request: Request, env: Env, userId: string): Promise<Response> {
  let body: { tier?: string };
  try {
    body = (await request.json()) as { tier?: string };
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }

  const tier = body.tier;
  if (!tier || !ALLOWED_TIERS.has(tier as AuthedUser["tier"])) {
    return jsonResponse({ ok: false, error: "tier must be free | sponsor | admin" }, 400);
  }

  const url = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ tier, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    return jsonResponse({ ok: false, error: `supabase ${res.status}: ${await res.text()}` }, 502);
  }
  const rows = (await res.json()) as unknown[];
  if (rows.length === 0) return jsonResponse({ ok: false, error: "user not found" }, 404);
  return jsonResponse({ ok: true, user: rows[0] }, 200);
}

// ─── GET /admin/scrape-health ──────────────────────────────────────────────
// Per-slug rollup from `scrape_company_runs` (migration 0009). Used to spot
// dead ATS endpoints without re-running the offline audit script.
//
// Query params:
//   ?lookback=10   — how many recent runs per slug to consider (default 10, max 50)
//   ?alerts_only=1 — only return slugs that tripped an alert rule

interface CompanyRunRow {
  ats: string;
  slug: string;
  company: string;
  raw_count: number;
  filtered_count: number;
  error: string | null;
  ran_at: string;
}

async function scrapeHealth(env: Env, url: URL): Promise<Response> {
  const lookback = Math.min(parseInt(url.searchParams.get("lookback") || "10", 10) || 10, 50);
  const alertsOnly = url.searchParams.get("alerts_only") === "1";

  // Pull the last `lookback * (estimated companies)` rows. Cheap on D1 — the
  // (ats, slug, ran_at DESC) index makes the per-slug group-by efficient.
  // Caps total at 5000 to keep response size bounded.
  const rowsResult = await env.DB
    .prepare(
      `SELECT ats, slug, company, raw_count, filtered_count, error, ran_at
         FROM scrape_company_runs
        ORDER BY ran_at DESC
        LIMIT 5000`,
    )
    .all<CompanyRunRow>();

  const rows = rowsResult.results || [];

  // Group by (ats, slug), keep only the most recent `lookback` rows each.
  const grouped = new Map<string, CompanyRunRow[]>();
  for (const r of rows) {
    const key = `${r.ats}/${r.slug}`;
    const bucket = grouped.get(key) || [];
    if (bucket.length < lookback) {
      bucket.push(r);
      grouped.set(key, bucket);
    }
  }

  const companies = [];
  const alerts = [];
  for (const runs of grouped.values()) {
    if (runs.length === 0) continue;
    const newest = runs[0];

    let consecutiveEmpty = 0;
    for (const r of runs) {
      if (r.raw_count === 0 && !r.error) consecutiveEmpty++;
      else break;
    }
    let consecutiveError = 0;
    for (const r of runs) {
      if (r.error) consecutiveError++;
      else break;
    }

    const avgRaw = runs.reduce((s, r) => s + r.raw_count, 0) / runs.length;
    const avgFiltered = runs.reduce((s, r) => s + r.filtered_count, 0) / runs.length;

    const summary = {
      ats: newest.ats,
      slug: newest.slug,
      company: newest.company,
      runs: runs.length,
      avg_raw: Math.round(avgRaw * 10) / 10,
      avg_filtered: Math.round(avgFiltered * 10) / 10,
      consecutive_empty: consecutiveEmpty,
      consecutive_error: consecutiveError,
      last_error: newest.error,
      last_ran_at: newest.ran_at,
    };

    // Alert rules: >=3 consecutive empties OR >=2 consecutive errors.
    // Tuned to avoid pager noise from one-off API hiccups while still
    // catching slugs that stayed broken across multiple 30-min cycles.
    let alertReason: string | null = null;
    if (consecutiveError >= 2) {
      alertReason = `${consecutiveError} consecutive errors (latest: ${newest.error})`;
    } else if (consecutiveEmpty >= 3) {
      alertReason = `${consecutiveEmpty} consecutive empty runs`;
    }

    if (alertReason) {
      alerts.push({ ats: newest.ats, slug: newest.slug, company: newest.company, reason: alertReason });
    }

    if (!alertsOnly || alertReason) {
      companies.push(summary);
    }
  }

  // Sort: alerts first, then by avg_raw ascending (most-broken first).
  companies.sort((a, b) => {
    const aBroken = a.consecutive_error >= 2 || a.consecutive_empty >= 3 ? 0 : 1;
    const bBroken = b.consecutive_error >= 2 || b.consecutive_empty >= 3 ? 0 : 1;
    if (aBroken !== bBroken) return aBroken - bBroken;
    return a.avg_raw - b.avg_raw;
  });

  return jsonResponse(
    {
      ok: true,
      as_of: new Date().toISOString(),
      lookback_runs: lookback,
      total_slugs_tracked: grouped.size,
      alert_count: alerts.length,
      alerts,
      companies,
    },
    200,
  );
}

// ─── helper ─────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
