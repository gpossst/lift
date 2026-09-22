CREATE TABLE IF NOT EXISTS user_info (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  image_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Keep existing Clerk-backed users visible after moving profile data out of
-- the identity table. New rows are created on their first authenticated call.
INSERT OR IGNORE INTO user_info (user_id, clerk_user_id, display_name, image_url, created_at, updated_at)
SELECT id, clerk_user_id, COALESCE(NULLIF(TRIM(display_name), ''), 'Lifter'), image_url, created_at, updated_at
FROM users
WHERE clerk_user_id IS NOT NULL;
