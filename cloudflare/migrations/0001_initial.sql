-- ─────────────────────────────────────────────────────────────────────────────
-- Reverse ATS — D1 schema (Phase 0)
--
-- Three tables, all global (shared across all future hosted users):
--   jobs              — raw scraped job listings, deduped by id hash
--   jobs_structured   — Llama 8B preprocessing output (skills, seniority, comp)
--   jobs_embeddings   — bge-m3 vector embeddings for fast pre-filter
--   ingest_runs       — audit log of each scrape ingest
--
-- Per-user tables (profiles, pipelines, scores) come in Phase 2 — keeping
-- those out for now means we can iterate on this schema freely without
-- touching user data that doesn't exist yet.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id                  TEXT PRIMARY KEY,
  company             TEXT NOT NULL,
  title               TEXT NOT NULL,
  url                 TEXT NOT NULL,
  location            TEXT,
  department          TEXT,
  description_full    TEXT,
  description_snippet TEXT,
  category            TEXT,
  ats_type            TEXT,
  remote              INTEGER NOT NULL DEFAULT 0,
  first_seen_at       TEXT NOT NULL,
  last_seen_at        TEXT NOT NULL,
  expired             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_jobs_first_seen   ON jobs(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company      ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_category     ON jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_expired      ON jobs(expired);

-- Llama 8B structured extraction — one row per job, populated async after ingest.
-- NULL columns mean "preprocess hasn't run yet" or "model couldn't extract that field".
CREATE TABLE IF NOT EXISTS jobs_structured (
  job_id                TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  seniority             TEXT,           -- junior|mid|senior|principal|director|vp|c_level
  years_experience_min  INTEGER,
  must_have_skills      TEXT,           -- JSON array of strings
  nice_to_have_skills   TEXT,           -- JSON array
  responsibilities      TEXT,           -- JSON array of bullets
  comp_min              INTEGER,
  comp_max              INTEGER,
  remote_policy         TEXT,           -- full_remote|hybrid|onsite|not_specified
  industry_tags         TEXT,           -- JSON array
  preprocessed_at       TEXT NOT NULL,
  preprocess_model      TEXT NOT NULL,
  preprocess_error      TEXT            -- non-NULL if preprocessing failed
);

CREATE INDEX IF NOT EXISTS idx_jobs_structured_seniority ON jobs_structured(seniority);

-- bge-m3 embeddings (1024 floats packed as a binary blob).
-- Used for fast cosine-similarity pre-filter once user resumes are also embedded.
CREATE TABLE IF NOT EXISTS jobs_embeddings (
  job_id        TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  embedding     BLOB NOT NULL,
  embedded_at   TEXT NOT NULL,
  model         TEXT NOT NULL
);

-- Audit log of every scrape ingest run.
CREATE TABLE IF NOT EXISTS ingest_runs (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  source               TEXT NOT NULL,            -- 'github-actions' | 'manual' | etc
  started_at           TEXT NOT NULL,
  completed_at         TEXT,
  jobs_received        INTEGER NOT NULL DEFAULT 0,
  jobs_new             INTEGER NOT NULL DEFAULT 0,
  jobs_updated         INTEGER NOT NULL DEFAULT 0,
  jobs_preprocessed    INTEGER NOT NULL DEFAULT 0,
  errors               TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_started ON ingest_runs(started_at DESC);
