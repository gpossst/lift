CREATE TABLE IF NOT EXISTS friend_pr_likes (
  author_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (author_id, workout_local_id, exercise_id, set_number, user_id),
  FOREIGN KEY (author_id, workout_local_id, exercise_id, set_number)
    REFERENCES workout_sets(user_id, workout_local_id, exercise_id, set_number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friend_pr_comments (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 280),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (author_id, workout_local_id, exercise_id, set_number)
    REFERENCES workout_sets(user_id, workout_local_id, exercise_id, set_number) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS friend_pr_comments_post ON friend_pr_comments(author_id, workout_local_id, exercise_id, set_number, created_at);
