-- 0010_job_lifecycle.sql
--
-- Job staleness / delisting. The `expired` flag already exists (0001) and is
-- cleared to 0 on every re-scrape (upsertJob), but nothing ever SETS it to 1 —
-- so jobs that vanish from their source ATS (filled, closed, board removed)
-- linger forever and show up as "active" in the feed. That is the #1 visible
-- staleness symptom.
--
-- This migration adds an `expired_at` timestamp for observability and a
-- composite index so the reaper (index.ts -> expireStaleJobs) can cheaply find
-- "active jobs not seen since <cutoff>".

ALTER TABLE jobs ADD COLUMN expired_at TEXT;

-- Reaper query: WHERE expired = 0 AND last_seen_at < ?  → flip to expired.
CREATE INDEX IF NOT EXISTS idx_jobs_active_lastseen
  ON jobs(expired, last_seen_at);
