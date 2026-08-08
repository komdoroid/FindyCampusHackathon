ALTER TABLE moods ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_moods_user ON moods(user_id, created_at);
