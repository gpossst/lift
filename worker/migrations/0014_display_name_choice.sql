ALTER TABLE user_info ADD COLUMN has_chosen_display_name INTEGER NOT NULL DEFAULT 0;

-- Existing accounts passed the previous name step or may have already set a name.
UPDATE user_info SET has_chosen_display_name = 1;
