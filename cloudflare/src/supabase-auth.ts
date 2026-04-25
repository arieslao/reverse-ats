// Supabase JWT verification for the Worker.
//
// Tokens issued by Supabase Auth are signed with an asymmetric ES256 key.
// We verify them locally against Supabase's JWKS — no per-request network
// call to supabase.auth.getUser(), keeps latency low and stays off Supabase
// API quotas.
//
// Tier is fetched from Supabase REST using the service-role key on demand.
// Only routes that gate on tier (e.g. /admin/*) pay that cost.

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { AuthedUser, Env } from "./schema";

// jose caches keys per JWKSet instance (default 30s cooldown, 10min TTL).
// Module-scope cache survives across requests on the same isolate.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(supabaseUrl: string) {
  let jwks = jwksCache.get(supabaseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    jwksCache.set(supabaseUrl, jwks);
  }
  return jwks;
}

interface SupabasePayload extends JWTPayload {
  email?: string;
  role?: string;
}

export interface VerifiedIdentity {
  userId: string;
  email: string;
}

/**
 * Verify the Supabase JWT in the request. Returns the userId+email if valid,
 * null otherwise. Does NOT fetch tier — that's a separate call.
 */
export async function verifyRequest(request: Request, env: Env): Promise<VerifiedIdentity | null> {
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  let payload: SupabasePayload;
  try {
    const result = await jwtVerify<SupabasePayload>(token, getJwks(env.SUPABASE_URL), {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });
    payload = result.payload;
  } catch (err) {
    console.log(`[auth] jwt verify failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  const userId = payload.sub;
  const email = payload.email;
  if (!userId || !email) return null;
  return { userId, email };
}

/**
 * Look up a user's tier from Supabase via the service-role REST endpoint.
 * Returns 'free' if the profile row is missing.
 */
export async function fetchTier(env: Env, userId: string): Promise<AuthedUser["tier"]> {
  const url = `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=tier`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    console.log(`[auth] tier lookup failed: ${res.status} ${await res.text()}`);
    return "free";
  }
  const rows = (await res.json()) as Array<{ tier: string }>;
  const tier = rows[0]?.tier;
  if (tier === "admin" || tier === "sponsor" || tier === "free") return tier;
  return "free";
}

/**
 * Verify identity AND require a minimum tier. Returns the AuthedUser on
 * success, or a 401/403 Response that the caller should return as-is.
 */
export async function requireTier(
  request: Request,
  env: Env,
  required: AuthedUser["tier"],
): Promise<AuthedUser | Response> {
  const identity = await verifyRequest(request, env);
  if (!identity) return jsonError(401, "unauthorized");

  const tier = await fetchTier(env, identity.userId);
  const order: Record<AuthedUser["tier"], number> = { free: 0, sponsor: 1, admin: 2 };
  if (order[tier] < order[required]) return jsonError(403, "forbidden");

  return { userId: identity.userId, email: identity.email, tier };
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
