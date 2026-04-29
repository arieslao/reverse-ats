-- ─────────────────────────────────────────────────────────────────────────────
-- Compensation + workplace classification fields.
--
-- Sources:
--   • Ashby:      structured `summaryComponents.Salary` + `compensationTierSummary`
--                 (~99% of US-disclosing employers like Ramp, OpenAI populate these).
--   • Lever:      `workplaceType` + `categories.commitment` are structured;
--                 salary regex-extracted from `additionalPlain` (~70% hit rate
--                 on US-disclosing employers).
--   • Greenhouse: no structured comp on the public board API; salary
--                 regex-extracted from inline HTML body (~1-2% hit rate).
--
-- `comp_summary` carries the human-readable string the employer published
-- (e.g. "$211.4K – $290.6K • Offers Equity"). Only populated by Ashby today;
-- we render it verbatim when present, fall back to formatting min/max
-- ourselves otherwise.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE jobs ADD COLUMN team             TEXT;
ALTER TABLE jobs ADD COLUMN employment_type  TEXT;  -- FullTime|PartTime|Intern|Contract|Temporary
ALTER TABLE jobs ADD COLUMN workplace_type   TEXT;  -- OnSite|Remote|Hybrid
ALTER TABLE jobs ADD COLUMN salary_min       INTEGER;
ALTER TABLE jobs ADD COLUMN salary_max       INTEGER;
ALTER TABLE jobs ADD COLUMN salary_currency  TEXT;
ALTER TABLE jobs ADD COLUMN comp_summary     TEXT;

-- Salary-band index supports future "min comp" filter on the feed.
CREATE INDEX IF NOT EXISTS idx_jobs_salary_min ON jobs(salary_min);
