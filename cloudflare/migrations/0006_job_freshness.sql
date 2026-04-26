-- ─────────────────────────────────────────────────────────────────────────────
-- Job freshness + repost detection.
--
-- Phase 1 — `posted_at`: the employer's own posted/updated date from the
-- source ATS API, distinct from `first_seen_at` (when our scraper saw it).
-- The gap between the two is our delivery lag.
--
-- Phase 2 — `fingerprint` + `job_reposts`: a content-only signature
-- (company + normalized title + normalized location) that's stable across
-- repostings. When an employer reposts the same role with a fresh URL,
-- the new row gets a new `id` (URL-based) but the same `fingerprint`.
-- One row per (fingerprint, job_id) sighting in `job_reposts` lets the
-- feed show "Reposted Nx" badges and the original first-seen date.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE jobs ADD COLUMN posted_at   TEXT;
ALTER TABLE jobs ADD COLUMN fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_posted_at   ON jobs(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(fingerprint);

CREATE TABLE IF NOT EXISTS job_reposts (
  fingerprint    TEXT NOT NULL,
  job_id         TEXT NOT NULL,
  first_seen_at  TEXT NOT NULL,   -- when WE first saw this specific job_id
  posted_at      TEXT,            -- employer-side date if known
  PRIMARY KEY (fingerprint, job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_reposts_fp_first_seen
  ON job_reposts(fingerprint, first_seen_at DESC);
