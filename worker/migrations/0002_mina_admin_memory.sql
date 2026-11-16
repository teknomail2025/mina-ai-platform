-- MinaData: one private memory record for the single configured administrator.
-- No public registration or additional user accounts are introduced.
CREATE TABLE IF NOT EXISTS mina_admin_memory (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  memory_text TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
