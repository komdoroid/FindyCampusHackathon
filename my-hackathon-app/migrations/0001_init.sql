CREATE TABLE IF NOT EXISTS moods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ward       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  comment    TEXT,
  gender     TEXT,
  age_group  TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_moods_created ON moods(created_at);
