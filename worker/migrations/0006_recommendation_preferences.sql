-- These fields are deliberately optional. They tune private cohort aggregates
-- and never become visible to other users.
ALTER TABLE user_info ADD COLUMN gym_id TEXT;
ALTER TABLE user_info ADD COLUMN available_equipment TEXT;
ALTER TABLE user_info ADD COLUMN session_minutes INTEGER;
ALTER TABLE user_info ADD COLUMN similar_users_opt_in INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS user_info_similar_users ON user_info(similar_users_opt_in, gym_id);
