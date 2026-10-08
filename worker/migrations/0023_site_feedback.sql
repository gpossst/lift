CREATE TABLE IF NOT EXISTS site_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'feature', 'other')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS site_feedback_votes (
  feedback_id TEXT NOT NULL REFERENCES site_feedback(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  PRIMARY KEY (feedback_id, user_id)
);

CREATE INDEX IF NOT EXISTS site_feedback_votes_user_id ON site_feedback_votes(user_id);
CREATE INDEX IF NOT EXISTS site_feedback_user_id ON site_feedback(user_id);
