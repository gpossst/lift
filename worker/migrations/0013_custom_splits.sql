-- Preserve the workout graph while removing the original three-value CHECK.
CREATE TABLE workouts_before_custom_splits AS SELECT * FROM workouts;
CREATE TABLE workout_sets_before_custom_splits AS SELECT * FROM workout_sets;
CREATE TABLE set_muscles_before_custom_splits AS SELECT * FROM set_muscles;
CREATE TABLE workout_muscle_ratings_before_custom_splits AS SELECT * FROM workout_muscle_ratings;
CREATE TABLE recommendation_feedback_before_custom_splits AS SELECT * FROM recommendation_feedback;

DROP TABLE set_muscles;
DROP TABLE workout_sets;
DROP TABLE workout_muscle_ratings;
DROP TABLE recommendation_feedback;
DROP TABLE workouts;

CREATE TABLE workouts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  split TEXT NOT NULL CHECK (split IN ('push', 'pull', 'legs') OR (length(split) = 43 AND substr(split, 1, 7) = 'custom:')),
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0,
  sync_revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, local_id)
);
INSERT INTO workouts SELECT * FROM workouts_before_custom_splits;

CREATE TABLE workout_sets (
  user_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  exercise_id TEXT NOT NULL,
  weight REAL NOT NULL CHECK (weight >= 0),
  reps INTEGER NOT NULL CHECK (reps > 0),
  completed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  sync_revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, workout_local_id, exercise_id, set_number),
  FOREIGN KEY (user_id, workout_local_id) REFERENCES workouts(user_id, local_id) ON DELETE CASCADE
);
INSERT INTO workout_sets SELECT * FROM workout_sets_before_custom_splits;
CREATE INDEX workout_sets_user_completed ON workout_sets(user_id, completed_at);

CREATE TABLE set_muscles (
  user_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  muscle TEXT NOT NULL,
  PRIMARY KEY (user_id, workout_local_id, exercise_id, set_number, muscle),
  FOREIGN KEY (user_id, workout_local_id, exercise_id, set_number)
    REFERENCES workout_sets(user_id, workout_local_id, exercise_id, set_number) ON DELETE CASCADE
);
INSERT INTO set_muscles SELECT * FROM set_muscles_before_custom_splits;
CREATE INDEX set_muscles_muscle ON set_muscles(muscle, user_id);

CREATE TABLE workout_muscle_ratings (
  user_id TEXT NOT NULL,
  workout_local_id TEXT NOT NULL,
  muscle TEXT NOT NULL,
  exhaustion INTEGER NOT NULL CHECK (exhaustion BETWEEN 1 AND 5),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  sync_revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, workout_local_id, muscle),
  FOREIGN KEY (user_id, workout_local_id) REFERENCES workouts(user_id, local_id) ON DELETE CASCADE
);
INSERT INTO workout_muscle_ratings SELECT * FROM workout_muscle_ratings_before_custom_splits;

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
INSERT INTO recommendation_feedback SELECT * FROM recommendation_feedback_before_custom_splits;
CREATE INDEX recommendation_feedback_user_created ON recommendation_feedback(user_id, created_at);

DROP TABLE workouts_before_custom_splits;
DROP TABLE workout_sets_before_custom_splits;
DROP TABLE set_muscles_before_custom_splits;
DROP TABLE workout_muscle_ratings_before_custom_splits;
DROP TABLE recommendation_feedback_before_custom_splits;

CREATE TABLE user_splits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK (length(id) = 43 AND substr(id, 1, 7) = 'custom:'),
  name TEXT NOT NULL,
  muscles TEXT NOT NULL CHECK (json_valid(muscles)),
  updated_at INTEGER NOT NULL,
  sync_revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE sync_tombstones RENAME TO sync_tombstones_before_splits;
CREATE TABLE sync_tombstones (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK (entity IN ('workout', 'set', 'rating', 'split')),
  record_key TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  sync_revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, entity, record_key)
);
INSERT INTO sync_tombstones SELECT * FROM sync_tombstones_before_splits;
DROP TABLE sync_tombstones_before_splits;
CREATE INDEX sync_tombstones_user_deleted ON sync_tombstones(user_id, deleted_at);

ALTER TABLE sync_changes RENAME TO sync_changes_before_splits;
CREATE TABLE sync_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('workout', 'set', 'rating', 'feedback', 'split')),
  record_key TEXT NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
  payload TEXT,
  UNIQUE (user_id, revision, entity, record_key)
);
INSERT INTO sync_changes SELECT * FROM sync_changes_before_splits;
DROP TABLE sync_changes_before_splits;
CREATE INDEX sync_changes_user_cursor ON sync_changes(user_id, id);
