-- Muscle check-ins move from 1–4 labels (Fresh/Worked/Tired/Spent) to a 0–10 slider.
CREATE TABLE workout_muscle_ratings_before_scale AS SELECT * FROM workout_muscle_ratings;
DROP TABLE workout_muscle_ratings;

CREATE TABLE workout_muscle_ratings (
  user_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  muscle TEXT NOT NULL,
  exhaustion INTEGER NOT NULL CHECK (exhaustion BETWEEN 0 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  sync_revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, workout_local_id, muscle),
  FOREIGN KEY (user_id, workout_local_id) REFERENCES workouts(user_id, local_id) ON DELETE CASCADE
);
INSERT INTO workout_muscle_ratings (user_id, workout_local_id, muscle, exhaustion, created_at, updated_at, sync_revision)
SELECT user_id, workout_local_id, muscle, CAST(ROUND((MIN(exhaustion, 5) - 1) * 2.5) AS INTEGER), created_at, updated_at, sync_revision
FROM workout_muscle_ratings_before_scale;

DROP TABLE workout_muscle_ratings_before_scale;
