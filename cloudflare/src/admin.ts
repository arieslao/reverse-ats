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

// ─── helper ─────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
