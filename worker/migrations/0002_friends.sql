ALTER TABLE users ADD COLUMN friend_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_friend_code ON users(friend_code);

CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id != friend_id)
);

CREATE INDEX IF NOT EXISTS friendships_friend_id ON friendships(friend_id);
