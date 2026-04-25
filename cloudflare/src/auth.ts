// Auth: passwordless email + 6-digit code → HttpOnly session cookie.
//
// Flow:
//   1. POST /auth/request {email}  → generate 6-digit code, hash it, store in
//      auth_codes (10 min TTL), send email via Resend.
//   2. POST /auth/verify {email, code}  → look up hash, validate, create
//      `users` row if first sign-in, create session row, set cookie.
//   3. GET  /auth/me   → returns {user} from session cookie, or 401.
//   4. POST /auth/logout → delete session row, clear cookie.

import type { Env, User, UserTier } from "./schema";
import { sendSignInCode } from "./email";

const COOKIE_NAME = "rats_session";
const SESSION_TTL_DAYS = 30;
const CODE_TTL_MIN = 10;
const CODE_RESEND_COOLDOWN_SEC = 60;
const MAX_VERIFY_ATTEMPTS = 3;

// ─── Public handlers ───────────────────────────────────────────────────────

export async function handleAuthRequest(request: Request, env: Env): Promise<Response> {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }
  const email = normalizeEmail(body.email);
  if (!email) return jsonError(400, "valid email required");

  // Cooldown: don't let someone spam codes for the same email.
  const existing = await env.DB.prepare(
    `SELECT created_at FROM auth_codes WHERE email = ?`,
  )
    .bind(email)
    .first<{ created_at: string }>();
  if (existing) {
    const ageSec = (Date.now() - new Date(existing.created_at).getTime()) / 1000;
    if (ageSec < CODE_RESEND_COOLDOWN_SEC) {
      return jsonError(429, `please wait ${Math.ceil(CODE_RESEND_COOLDOWN_SEC - ageSec)}s before requesting a new code`);
    }
  }

  const code = generateCode();
  const codeHash = await sha256(code);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MIN * 60_000);

  await env.DB.prepare(
    `INSERT OR REPLACE INTO auth_codes (email, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)`,
  )
    .bind(email, codeHash, expiresAt.toISOString(), now.toISOString())
    .run();

  const sendResult = await sendSignInCode(env.RESEND_API_KEY, email, code);
  if (!sendResult.ok) {
    // Don't leak the specific reason to the client, but log for ops.
    console.log(`auth/request email send failed for ${email}: ${sendResult.error}`);
    return jsonError(502, "could not send code, please try again");
  }

  return jsonOk({ ok: true, message: "code sent" });
}

export async function handleAuthVerify(request: Request, env: Env): Promise<Response> {
  let body: { email?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid JSON body");
  }
  const email = normalizeEmail(body.email);
  const code = (body.code || "").trim();
  if (!email || !/^\d{6}$/.test(code)) {
    return jsonError(400, "valid email and 6-digit code required");
  }

  const row = await env.DB.prepare(
    `SELECT code_hash, expires_at, attempts FROM auth_codes WHERE email = ?`,
  )
    .bind(email)
    .first<{ code_hash: string; expires_at: string; attempts: number }>();

  if (!row) return jsonError(400, "no active code, request a new one");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare(`DELETE FROM auth_codes WHERE email = ?`).bind(email).run();
    return jsonError(400, "code expired, request a new one");
  }
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    await env.DB.prepare(`DELETE FROM auth_codes WHERE email = ?`).bind(email).run();
    return jsonError(400, "too many attempts, request a new code");
  }

  const submittedHash = await sha256(code);
  if (!constantTimeEquals(submittedHash, row.code_hash)) {
    await env.DB.prepare(`UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?`)
      .bind(email)
      .run();
    return jsonError(400, "incorrect code");
  }

  // Code valid — burn it, upsert user, create session.
  await env.DB.prepare(`DELETE FROM auth_codes WHERE email = ?`).bind(email).run();

  const user = await upsertUserOnSignIn(env, email);
  const session = await createSession(env, user.id, request);

  return new Response(
    JSON.stringify({ ok: true, user: publicUser(user) }, null, 2),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": sessionCookie(session.id, session.expires_at),
      },
    },
  );
}

export async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromRequest(env, request);
  if (!user) return jsonError(401, "not signed in");
  return jsonOk({ ok: true, user: publicUser(user) });
}

export async function handleAuthLogout(request: Request, env: Env): Promise<Response> {
  const sid = readSessionCookie(request);
  if (sid) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sid).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}

// ─── Session helpers (also used by admin handlers + /jobs gating later) ────

export async function getUserFromRequest(env: Env, request: Request): Promise<User | null> {
  const sid = readSessionCookie(request);
  if (!sid) return null;

  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.tier, u.created_at, u.last_login_at, s.expires_at AS session_expires
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
  )
    .bind(sid)
    .first<User & { session_expires: string }>();

  if (!row) return null;
  if (new Date(row.session_expires).getTime() < Date.now()) {
    await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sid).run();
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    tier: row.tier as UserTier,
    created_at: row.created_at,
    last_login_at: row.last_login_at,
  };
}

export function publicUser(u: User) {
  return { id: u.id, email: u.email, tier: u.tier };
}

// ─── Internals ─────────────────────────────────────────────────────────────

async function upsertUserOnSignIn(env: Env, email: string): Promise<User> {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`)
    .bind(email)
    .first<User>();
  if (existing) {
    await env.DB.prepare(`UPDATE users SET last_login_at = ? WHERE id = ?`)
      .bind(now, existing.id)
      .run();
    return { ...existing, last_login_at: now };
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, email, tier, created_at, last_login_at)
     VALUES (?, ?, 'free', ?, ?)`,
  )
    .bind(id, email, now, now)
    .run();
  return { id, email, tier: "free", created_at: now, last_login_at: now };
}

async function createSession(env: Env, userId: string, request: Request) {
  const id = randomHex(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86400_000);
  const userAgent = request.headers.get("User-Agent")?.slice(0, 256) || null;
  const ipCountry = request.headers.get("CF-IPCountry") || null;

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip_country)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, now.toISOString(), expiresAt.toISOString(), userAgent, ipCountry)
    .run();

  return { id, expires_at: expiresAt.toISOString() };
}

function sessionCookie(sid: string, expiresAt: string): string {
  const expires = new Date(expiresAt).toUTCString();
  return `${COOKIE_NAME}=${sid}; Path=/; Expires=${expires}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;
}

function readSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === COOKIE_NAME) return part.slice(eq + 1);
  }
  return null;
}

function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  // Loose RFC-ish check — Resend will reject malformed addresses anyway.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  if (trimmed.length > 254) return null;
  return trimmed;
}

function generateCode(): string {
  // Cryptographically random 6-digit code (000000–999999).
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
