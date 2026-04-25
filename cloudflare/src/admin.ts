// Admin endpoints — list / promote / revoke users.
// All routes here require the caller's session to belong to a user with tier='admin'.

import type { Env, UserTier } from "./schema";
import { getUserFromRequest } from "./auth";

const ALLOWED_TIERS: UserTier[] = ["free", "sponsor", "admin"];

export async function handleAdminListUsers(request: Request, env: Env): Promise<Response> {
  const admin = await requireAdmin(env, request);
  if (admin instanceof Response) return admin;

  const rows = await env.DB.prepare(
    `SELECT u.id, u.email, u.tier, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS active_sessions
       FROM users u
      ORDER BY u.created_at DESC
      LIMIT 500`,
  )
    .bind(new Date().toISOString())
    .all();

  return jsonOk({ ok: true, users: rows.results || [] });
}

export async function handleAdminPatchUser(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const admin = await requireAdmin(env, request);
  if (admin instanceof Response) return admin;

  let body: { tier?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }
  const tier = (body.tier || "").trim() as UserTier;
  if (!ALLOWED_TIERS.includes(tier)) {
    return jsonError(400, `tier must be one of: ${ALLOWED_TIERS.join(", ")}`);
  }

  // Don't let an admin demote themselves — guards against locking out the only admin.
  if (userId === admin.id && tier !== "admin") {
    return jsonError(400, "cannot demote yourself; promote another admin first");
  }

  const result = await env.DB.prepare(`UPDATE users SET tier = ? WHERE id = ?`)
    .bind(tier, userId)
    .run();

  if (!result.meta.changes) return jsonError(404, "user not found");
  return jsonOk({ ok: true });
}

export async function handleAdminDeleteUser(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const admin = await requireAdmin(env, request);
  if (admin instanceof Response) return admin;

  if (userId === admin.id) {
    return jsonError(400, "cannot delete your own account from /admin");
  }

  // sessions row has ON DELETE CASCADE → cleaned up automatically.
  const result = await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
  if (!result.meta.changes) return jsonError(404, "user not found");
  return jsonOk({ ok: true });
}

// ─── Internals ─────────────────────────────────────────────────────────────

async function requireAdmin(env: Env, request: Request) {
  const user = await getUserFromRequest(env, request);
  if (!user) return jsonError(401, "not signed in");
  if (user.tier !== "admin") return jsonError(403, "admin only");
  return user;
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
