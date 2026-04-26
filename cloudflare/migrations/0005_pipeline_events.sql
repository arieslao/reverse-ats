-- Pipeline stage history. One row per stage transition (or initial save).
-- Lets the UI render a timeline ("saved 4d ago → applied 2d ago → phone screen today").

CREATE TABLE IF NOT EXISTS pipeline_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_id   INTEGER NOT NULL,
  user_id       TEXT NOT NULL,
  from_stage    TEXT,             -- NULL on the initial 'saved' event
  to_stage      TEXT NOT NULL,
  note          TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_pipeline
  ON pipeline_events(pipeline_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_user
  ON pipeline_events(user_id, created_at DESC);
