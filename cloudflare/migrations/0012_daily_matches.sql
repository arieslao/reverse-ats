-- 0012_daily_matches.sql
--
-- Daily best-fit matches per user. A daily cron computes the top job matches
-- against each user's inventory (preference-weighted) and stores them here so
-- both the morning email digest and the in-app "Daily Matches" tab read the
-- same precomputed set. Each job is surfaced to a user at most once (we skip
-- jobs already present in any prior daily_matches row for that user), so the
-- digest is "new fits you haven't seen", not a re-rank of the whole feed.

CREATE TABLE IF NOT EXISTS daily_matches (
  user_id       TEXT NOT NULL,
  job_id        TEXT NOT NULL,
  match_date    TEXT NOT NULL,        -- YYYY-MM-DD (UTC)
  fit_score     REAL NOT NULL,        -- composite digest score (0-100)
  coverage_pct  INTEGER,              -- % of required skills met
  rank          INTEGER,              -- 1 = best fit that day
  reasons       TEXT,                 -- JSON {strengths:[], gaps:[]}
  emailed       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, job_id, match_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_matches_user_date
  ON daily_matches(user_id, match_date DESC, rank);

-- "has this job ever been surfaced to this user?" lookup for dedup.
CREATE INDEX IF NOT EXISTS idx_daily_matches_user_job
  ON daily_matches(user_id, job_id);
