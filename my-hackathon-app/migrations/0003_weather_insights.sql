CREATE TABLE IF NOT EXISTS weather_insights (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  weather_temp   REAL,
  weather_code   INTEGER,
  weather_label  TEXT,
  mood_overall   REAL,
  comment        TEXT NOT NULL,
  generated_at   TEXT NOT NULL
);
