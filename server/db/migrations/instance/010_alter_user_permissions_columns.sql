-- Rename can_configure_instance to can_configure_settings and add can_configure_assets column

ALTER TABLE user_permissions RENAME COLUMN can_configure_instance TO can_configure_settings;

ALTER TABLE user_permissions ADD COLUMN can_configure_assets boolean NOT NULL DEFAULT FALSE;
