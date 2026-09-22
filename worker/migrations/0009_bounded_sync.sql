-- Server-assigned revisions replace device timestamps for conflict resolution.
-- A request advances the account revision once, then applies at most three
-- mutations atomically at that revision.
CREATE TABLE sync_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sync_batches (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, batch_id)
);

CREATE TABLE sync_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('workout', 'set', 'rating', 'feedback')),
  record_key TEXT NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0, 1)),
  payload TEXT,
  UNIQUE (user_id, revision, entity, record_key)
);
CREATE INDEX sync_changes_user_cursor ON sync_changes(user_id, id);

ALTER TABLE workouts ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workout_sets ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workout_muscle_ratings ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recommendation_feedback ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_tombstones ADD COLUMN sync_revision INTEGER NOT NULL DEFAULT 0;

-- Make pre-migration server data available to fresh clients. The change-table
-- id is the pagination cursor, so revision 1 may safely contain any row count.
INSERT INTO sync_accounts (user_id, revision)
SELECT id, 1 FROM users
WHERE EXISTS (SELECT 1 FROM workouts WHERE workouts.user_id = users.id)
   OR EXISTS (SELECT 1 FROM sync_tombstones WHERE sync_tombstones.user_id = users.id);
UPDATE workouts SET sync_revision = 1;
UPDATE workout_sets SET sync_revision = 1;
UPDATE workout_muscle_ratings SET sync_revision = 1;
UPDATE recommendation_feedback SET sync_revision = 1;
UPDATE sync_tombstones SET sync_revision = 1;

INSERT INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
SELECT user_id, 1, 'workout', local_id, 0,
  json_object('id', local_id, 'split', split, 'createdAt', created_at, 'endedAt', ended_at)
FROM workouts;
INSERT INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
SELECT ws.user_id, 1, 'set', ws.workout_local_id || char(31) || ws.exercise_id || char(31) || ws.set_number, 0,
  json_object('workoutId', ws.workout_local_id, 'exerciseId', ws.exercise_id, 'setNumber', ws.set_number,
    'weight', ws.weight, 'reps', ws.reps, 'completedAt', ws.completed_at, 'muscles',
    json(COALESCE((SELECT json_group_array(muscle) FROM set_muscles sm
      WHERE sm.user_id = ws.user_id AND sm.workout_local_id = ws.workout_local_id
        AND sm.exercise_id = ws.exercise_id AND sm.set_number = ws.set_number), '[]')))
FROM workout_sets ws;
INSERT INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
SELECT user_id, 1, 'rating', workout_local_id || char(31) || muscle, 0,
  json_object('workoutId', workout_local_id, 'muscle', muscle, 'exhaustion', exhaustion, 'createdAt', created_at)
FROM workout_muscle_ratings;
INSERT INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
SELECT user_id, 1, 'feedback', workout_local_id || char(31) || exercise_id || char(31) || action, 0,
  json_object('workoutId', workout_local_id, 'exerciseId', exercise_id, 'action', action,
    'relatedExerciseId', related_exercise_id, 'createdAt', created_at)
FROM recommendation_feedback;
INSERT INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
SELECT user_id, 1, entity, record_key, 1, NULL FROM sync_tombstones;
