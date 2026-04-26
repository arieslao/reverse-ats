// Per-user daily action limits, indexed by tier.
//
//   limits[action][tier] = max calls per UTC day
//
// Cover letter is the only AI-cost-bearing action that's tier-gated for now.
// Adding a new action: extend LIMITS and call checkAndConsume() before the work.

import type { AuthedUser, Env } from "./schema";

// Daily caps (reset at UTC midnight). -1 = unlimited.
export const LIMITS: Record<string, Record<AuthedUser["tier"], number>> = {
  cover_letter: { free: 2, sponsor: 30, admin: 100 },
  suggest_roles: { free: 1, sponsor: 5, admin: 20 },
  rescore: { free: 1, sponsor: 4, admin: 20 },
};

// Lifetime caps (no reset). -1 = unlimited.
export const LIFETIME_LIMITS: Record<string, Record<AuthedUser["tier"], number>> = {
  saved_jobs: { free: 50, sponsor: -1, admin: -1 },
};

export function limitFor(action: keyof typeof LIMITS, tier: AuthedUser["tier"]): number {
  return LIMITS[action]?.[tier] ?? 0;
}

export function lifetimeLimitFor(action: keyof typeof LIFETIME_LIMITS, tier: AuthedUser["tier"]): number {
  return LIFETIME_LIMITS[action]?.[tier] ?? -1;
}

/**
 * Check a lifetime cap given the caller's already-known current count.
 * Returns ok=false when the cap is reached. -1 limit = unlimited (always ok).
 */
export function checkLifetime(
  action: keyof typeof LIFETIME_LIMITS,
  tier: AuthedUser["tier"],
  currentCount: number,
): UsageState {
  const limit = lifetimeLimitFor(action, tier);
  if (limit < 0) return { ok: true, used: currentCount, remaining: -1, limit: -1 };
  return {
    ok: currentCount < limit,
    used: currentCount,
    remaining: Math.max(0, limit - currentCount),
    limit,
  };
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface UsageState {
  ok: boolean;
  used: number;
  remaining: number;
  limit: number;
}

/**
 * Look up today's count for (user, action) without consuming. Returns the
 * usage state for display in the UI.
 */
export async function readUsage(
  env: Env,
  userId: string,
  action: keyof typeof LIMITS,
  tier: AuthedUser["tier"],
): Promise<UsageState> {
  const limit = limitFor(action, tier);
  const row = await env.DB.prepare(
    `SELECT count FROM user_usage WHERE user_id = ? AND action = ? AND day = ?`,
  )
    .bind(userId, action, utcDay())
    .first<{ count: number }>();
  const used = row?.count ?? 0;
  return { ok: used < limit, used, remaining: Math.max(0, limit - used), limit };
}

/**
 * Atomically check + increment today's count. Returns ok=false (with current
 * counts) if the limit is already reached, ok=true after consuming one.
 */
export async function checkAndConsume(
  env: Env,
  userId: string,
  action: keyof typeof LIMITS,
  tier: AuthedUser["tier"],
): Promise<UsageState> {
  const limit = limitFor(action, tier);
  const day = utcDay();

  // Read first to short-circuit when over.
  const before = await env.DB.prepare(
    `SELECT count FROM user_usage WHERE user_id = ? AND action = ? AND day = ?`,
  )
    .bind(userId, action, day)
    .first<{ count: number }>();
  const used = before?.count ?? 0;
  if (used >= limit) {
    return { ok: false, used, remaining: 0, limit };
  }

  await env.DB.prepare(
    `INSERT INTO user_usage (user_id, action, day, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, action, day) DO UPDATE SET count = count + 1`,
  )
    .bind(userId, action, day)
    .run();

  return { ok: true, used: used + 1, remaining: limit - used - 1, limit };
}
