CREATE TABLE IF NOT EXISTS friend_workout_likes (
  author_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (author_id, workout_local_id, user_id),
  FOREIGN KEY (author_id, workout_local_id) REFERENCES workouts(user_id, local_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friend_workout_comments (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 280),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (author_id, workout_local_id) REFERENCES workouts(user_id, local_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS friend_workout_comments_post ON friend_workout_comments(author_id, workout_local_id, created_at);

INSERT OR IGNORE INTO friend_workout_likes (author_id, workout_local_id, user_id, created_at)
SELECT author_id, workout_local_id, user_id, MIN(created_at)
FROM friend_pr_likes GROUP BY author_id, workout_local_id, user_id;

INSERT OR IGNORE INTO friend_workout_comments (id, author_id, workout_local_id, user_id, body, created_at)
SELECT id, author_id, workout_local_id, user_id, body, created_at FROM friend_pr_comments;
