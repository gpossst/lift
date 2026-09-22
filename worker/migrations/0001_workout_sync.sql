CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Tokens are only stored as SHA-256 hashes. A token grants access to a single
-- anonymous install until a real account provider is added.
CREATE TABLE IF NOT EXISTS device_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workouts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  split TEXT NOT NULL CHECK (split IN ('push', 'pull', 'legs')),
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  PRIMARY KEY (user_id, local_id)
);

CREATE TABLE IF NOT EXISTS workout_sets (
  user_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  exercise_id TEXT NOT NULL,
  weight REAL NOT NULL CHECK (weight >= 0),
  reps INTEGER NOT NULL CHECK (reps > 0),
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, workout_local_id, exercise_id, set_number),
  FOREIGN KEY (user_id, workout_local_id) REFERENCES workouts(user_id, local_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS workout_sets_user_completed ON workout_sets(user_id, completed_at);

CREATE TABLE IF NOT EXISTS set_muscles (
  user_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  muscle TEXT NOT NULL,
  PRIMARY KEY (user_id, workout_local_id, exercise_id, set_number, muscle),
  FOREIGN KEY (user_id, workout_local_id, exercise_id, set_number)
    REFERENCES workout_sets(user_id, workout_local_id, exercise_id, set_number) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS set_muscles_muscle ON set_muscles(muscle, user_id);

CREATE TABLE IF NOT EXISTS workout_muscle_ratings (
  user_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  muscle TEXT NOT NULL,
  exhaustion INTEGER NOT NULL CHECK (exhaustion BETWEEN 1 AND 5),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, workout_local_id, muscle),
  FOREIGN KEY (user_id, workout_local_id) REFERENCES workouts(user_id, local_id) ON DELETE CASCADE
);
