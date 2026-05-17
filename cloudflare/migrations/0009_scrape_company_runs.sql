-- 0009_scrape_company_runs.sql
--
-- Per-company scrape outcomes for every ingest run. Lets us answer:
--   * which companies are returning 0 jobs and for how long
--   * which ATS endpoints are 4xx/5xx-ing
--   * how the title filter dropoff compares across slugs
--
-- The audit script `scripts/audit_ci_companies.py` can answer these once,
-- on demand. This table makes them queryable on every run with no extra
-- cron — pipeline.py uploads one row per company per run alongside the
-- normal /ingest payload.

CREATE TABLE IF NOT EXISTS scrape_company_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ingest_run_id   INTEGER NOT NULL,
  company         TEXT NOT NULL,
  ats             TEXT NOT NULL,
  slug            TEXT NOT NULL,
  raw_count       INTEGER NOT NULL DEFAULT 0,   -- jobs returned by ATS API (pre-filter)
  filtered_count  INTEGER NOT NULL DEFAULT 0,   -- jobs after title/remote filter
  error           TEXT,                          -- HTTP/network/parse error if any
  ran_at          TEXT NOT NULL,                 -- ISO8601 UTC
  FOREIGN KEY (ingest_run_id) REFERENCES ingest_runs(id) ON DELETE CASCADE
);

-- Most queries are "for this (ats, slug), what did the last N runs look like?"
CREATE INDEX IF NOT EXISTS idx_company_runs_slug
  ON scrape_company_runs(ats, slug, ran_at DESC);

-- Join back to ingest_runs efficiently when paging.
CREATE INDEX IF NOT EXISTS idx_company_runs_ingest
  ON scrape_company_runs(ingest_run_id);
