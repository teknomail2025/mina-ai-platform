-- Graduated conduct policy. Message contents are not stored.
CREATE TABLE IF NOT EXISTS mina_discipline_state (
  user_id TEXT PRIMARY KEY,
  violation_count INTEGER NOT NULL DEFAULT 0,
  restricted_until INTEGER,
  appeal_status TEXT NOT NULL DEFAULT 'none',
  appeal_text TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mina_discipline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  violation_count INTEGER NOT NULL,
  restriction_minutes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mina_discipline_events_user_created
  ON mina_discipline_events(user_id, created_at DESC);
