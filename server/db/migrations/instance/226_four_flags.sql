-- Four flags instead of six. can_configure_settings folds into
-- can_configure_data: no real instance holds the settings flag without the
-- data flag, and the three settings routes are instance data configuration.
-- can_view_logs folds too: a package's module logs are package contents, read
-- under can_view_data, and the user activity log is the Users tab's, read
-- under can_view_users. Nobody is lowered.
UPDATE users SET can_configure_data = TRUE WHERE can_configure_settings;

ALTER TABLE users DROP COLUMN IF EXISTS can_configure_settings;
ALTER TABLE users DROP COLUMN IF EXISTS can_view_logs;
