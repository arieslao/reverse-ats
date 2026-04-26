-- Per-user profile data — Phase 4a.
--
-- Keyed on the Supabase user_id (auth.users.id, UUID). The Worker enforces
-- ownership by writing/reading WHERE user_id = <verified JWT subject>; D1 has
-- no native RLS, so every per-user query MUST filter on user_id explicitly.
--
-- Array fields are stored as JSON TEXT — D1 doesn't have a JSON type, but
-- json_*() functions work and the frontend already parses arrays.

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id                TEXT PRIMARY KEY,            -- Supabase auth.users.id (UUID)
  resume_text            TEXT,
  target_roles           TEXT NOT NULL DEFAULT '[]',  -- JSON array
  target_locations       TEXT NOT NULL DEFAULT '[]',  -- JSON array
  remote_only            INTEGER NOT NULL DEFAULT 0,  -- 0|1
  min_seniority          TEXT,
  salary_min             INTEGER,
  salary_max             INTEGER,
  must_have_skills       TEXT NOT NULL DEFAULT '[]',
  nice_to_have_skills    TEXT NOT NULL DEFAULT '[]',
  blacklisted_companies  TEXT NOT NULL DEFAULT '[]',
  blacklisted_keywords   TEXT NOT NULL DEFAULT '[]',
  priority_categories    TEXT NOT NULL DEFAULT '[]',
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
