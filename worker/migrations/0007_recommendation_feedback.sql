CREATE TABLE IF NOT EXISTS recommendation_feedback (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_local_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accepted', 'completed', 'replaced', 'removed', 'skipped', 'manual')),
  related_exercise_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, workout_local_id, exercise_id, action),
  FOREIGN KEY (user_id, workout_local_id) REFERENCES workouts(user_id, local_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS recommendation_feedback_user_created
  ON recommendation_feedback(user_id, created_at);
