ALTER TABLE recommendation_feedback RENAME TO recommendation_feedback_legacy;

CREATE TABLE recommendation_feedback (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_local_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('accepted', 'completed', 'impression', 'replaced', 'removed', 'skipped', 'manual')),
  related_exercise_id TEXT,
  rank INTEGER CHECK (rank IS NULL OR rank BETWEEN 1 AND 100),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, workout_local_id, exercise_id, action),
  FOREIGN KEY (user_id, workout_local_id) REFERENCES workouts(user_id, local_id) ON DELETE CASCADE
);

INSERT INTO recommendation_feedback
SELECT user_id, workout_local_id, exercise_id, action, related_exercise_id, NULL, created_at, updated_at, sync_revision
FROM recommendation_feedback_legacy;

DROP TABLE recommendation_feedback_legacy;

CREATE INDEX recommendation_feedback_user_created
  ON recommendation_feedback(user_id, created_at);
