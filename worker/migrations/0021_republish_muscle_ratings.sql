-- 0020 changed the stored scale without publishing it to incremental clients.
-- Append canonical records rather than changing historical upload receipts.
INSERT INTO sync_accounts (user_id, revision)
SELECT user_id, MAX(sync_revision) FROM workout_muscle_ratings GROUP BY user_id
ON CONFLICT(user_id) DO NOTHING;

UPDATE sync_accounts SET revision = revision + 1
WHERE user_id IN (SELECT user_id FROM workout_muscle_ratings);

UPDATE workout_muscle_ratings SET sync_revision = (
  SELECT revision FROM sync_accounts WHERE user_id = workout_muscle_ratings.user_id
);

INSERT INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
SELECT user_id, sync_revision, 'rating', workout_local_id || char(31) || muscle, 0,
  json_object('workoutId', workout_local_id, 'muscle', muscle,
    'exhaustion', exhaustion, 'createdAt', created_at)
FROM workout_muscle_ratings;
