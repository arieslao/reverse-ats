-- Per-user daily usage counters for tier-gated actions.
--
-- Day is the UTC date as YYYY-MM-DD. Old rows can be pruned periodically
-- but storage is tiny (one row per user per active day per action).

CREATE TABLE IF NOT EXISTS user_usage (
  user_id  TEXT NOT NULL,
  action   TEXT NOT NULL,   -- 'cover_letter' | future actions
  day      TEXT NOT NULL,   -- UTC YYYY-MM-DD
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action, day)
);
CREATE INDEX IF NOT EXISTS idx_user_usage_user_action ON user_usage(user_id, action);
