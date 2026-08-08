CREATE TABLE IF NOT EXISTS user_insights (
  user_id       TEXT PRIMARY KEY,
  weather_temp  REAL,
  weather_code  INTEGER,
  weather_label TEXT,
  post_count    INTEGER NOT NULL DEFAULT 0,
  comment       TEXT NOT NULL,
  generated_at  TEXT NOT NULL
);
