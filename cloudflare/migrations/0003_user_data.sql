-- Per-user data tables — Phase 4b/c/e.
--
-- All keyed on Supabase auth.users.id (UUID). The Worker enforces ownership
-- by filtering WHERE user_id = ? on every read/write.

-- Dismissed jobs — user clicked "hide" on the feed.
CREATE TABLE IF NOT EXISTS user_dismissed (
  user_id        TEXT NOT NULL,
  job_id         TEXT NOT NULL,
  dismissed_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_user_dismissed_user ON user_dismissed(user_id);

-- Pipeline — saved jobs with stage tracking. One row per (user, job).
-- We keep id as a stable surrogate the frontend can address.
CREATE TABLE IF NOT EXISTS user_pipeline (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL,
  job_id          TEXT NOT NULL,
  stage           TEXT NOT NULL DEFAULT 'saved',  -- saved|applied|phone_screen|technical|final|offer|rejected|withdrawn
  applied_at      TEXT,
  notes           TEXT,
  contact_name    TEXT,
  contact_email   TEXT,
  contact_role    TEXT,
  next_step       TEXT,
  next_step_date  TEXT,
  salary_offered  INTEGER,
  cover_letter    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE(user_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_user_pipeline_user_stage ON user_pipeline(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_user_pipeline_user_updated ON user_pipeline(user_id, updated_at DESC);

-- Per-user job scores — LLM scoring is per-user-profile so we cache here
-- rather than on the shared `jobs` row. Recomputed on profile change or
-- explicit /api/scoring/rescore call.
CREATE TABLE IF NOT EXISTS user_job_scores (
  user_id         TEXT NOT NULL,
  job_id          TEXT NOT NULL,
  llm_score       INTEGER,            -- 0..100
  llm_reasoning   TEXT,
  scored_at       TEXT NOT NULL,
  scoring_model   TEXT,
  PRIMARY KEY (user_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_user_job_scores_user_score ON user_job_scores(user_id, llm_score DESC);
