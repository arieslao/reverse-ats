-- ─────────────────────────────────────────────────────────────────────────────
-- Reverse ATS — D1 schema (Phase 2: auth + admin)
--
-- Three new tables:
--   users         — registered accounts, tier-gated (free / sponsor / admin)
--   auth_codes    — short-lived 6-digit email codes (10 min TTL)
--   sessions      — server-side session tokens, set as HttpOnly cookie
--
-- Auth model: passwordless. User submits email → 6-digit code arrives via
-- Resend → user submits code → session cookie is set. Code is hashed (SHA-256)
-- before storage so a DB leak doesn't expose live codes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,                    -- lowercased on write
  tier            TEXT NOT NULL DEFAULT 'free',            -- 'free' | 'sponsor' | 'admin'
  created_at      TEXT NOT NULL,
  last_login_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

-- One active code per email at any time. New request overwrites the old one.
CREATE TABLE IF NOT EXISTS auth_codes (
  email           TEXT PRIMARY KEY,
  code_hash       TEXT NOT NULL,                           -- sha256(code) hex
  expires_at      TEXT NOT NULL,                           -- ISO, ~10 min from creation
  attempts        INTEGER NOT NULL DEFAULT 0,              -- 3 wrong → invalidate
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,                        -- random 32-byte hex
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,                           -- 30 days
  user_agent      TEXT,
  ip_country      TEXT                                     -- from CF-IPCountry header
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
