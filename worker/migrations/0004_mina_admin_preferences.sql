-- Cloud-synced administrator preferences shared by Mina web clients.
CREATE TABLE IF NOT EXISTS mina_admin_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  preferences_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
