-- Clerk's stable user ID is the canonical ID for all newly authenticated rows.
-- Existing anonymous rows deliberately remain unclaimed: assigning them to a
-- Clerk account without an explicit, authenticated migration would be unsafe.
ALTER TABLE users ADD COLUMN clerk_user_id TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN image_url TEXT;
ALTER TABLE users ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_user_id_unique
  ON users(clerk_user_id) WHERE clerk_user_id IS NOT NULL;

-- `updated_at` makes each record independently mergeable.  The original
-- timestamps are the best available version for pre-existing rows.
ALTER TABLE workouts ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE workouts SET updated_at = MAX(created_at, COALESCE(ended_at, 0)) WHERE updated_at = 0;

ALTER TABLE workout_sets ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE workout_sets SET updated_at = completed_at WHERE updated_at = 0;

ALTER TABLE workout_muscle_ratings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE workout_muscle_ratings SET updated_at = created_at WHERE updated_at = 0;

-- Deletions must outlive a device that was offline when they happened.  A
-- tombstone wins over an equal-or-older row and is returned with every full
-- snapshot, so a newly installed device can hydrate correctly as well.
CREATE TABLE IF NOT EXISTS sync_tombstones (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK (entity IN ('workout', 'set', 'rating')),
  record_key TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, entity, record_key)
);

CREATE INDEX IF NOT EXISTS sync_tombstones_user_deleted
  ON sync_tombstones(user_id, deleted_at);
