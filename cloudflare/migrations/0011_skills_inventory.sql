-- 0011_skills_inventory.sql
--
-- Structured skills + experience inventory, per user. Today the profile holds a
-- freeform resume_text plus flat skill *tag* arrays (no proficiency, no years,
-- no work history). That can't support a real 1-to-1 comparison against a job's
-- required / nice-to-have skills, or a "where you're strong vs. where you have
-- gaps" readout. This table is the canonical structured inventory, populated
-- from the resume AND from LinkedIn (export ZIP rows or pasted text), merged
-- with provenance so later phases (gap matching, tailored docs) read one source.
--
-- All payloads are JSON arrays/objects validated in the Worker before write.

CREATE TABLE IF NOT EXISTS user_inventory (
  user_id         TEXT PRIMARY KEY,        -- Supabase auth.users.id
  -- [{name, category, years, proficiency(1-5), last_used, source}]
  skills          TEXT NOT NULL DEFAULT '[]',
  -- [{company, title, start, end, location, highlights[]}]
  experience      TEXT NOT NULL DEFAULT '[]',
  -- [{school, degree, field, start, end}]
  education        TEXT NOT NULL DEFAULT '[]',
  -- [{name, issuer, date}]
  certifications  TEXT NOT NULL DEFAULT '[]',
  summary         TEXT,                    -- short professional summary
  total_years_experience REAL,            -- best estimate across sources
  sources         TEXT NOT NULL DEFAULT '[]',  -- ['resume','linkedin'] provenance
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
