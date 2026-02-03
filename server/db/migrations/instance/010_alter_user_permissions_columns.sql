-- Rename can_configure_instance to can_configure_settings (if it exists) and add can_configure_assets column (if it doesn't exist)
-- This migration handles the case where 009 was run with either old or new column names

-- Rename column if the old name exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'can_configure_instance'
  ) THEN
    ALTER TABLE user_permissions RENAME COLUMN can_configure_instance TO can_configure_settings;
  END IF;
END $$;

-- Add can_configure_assets column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'can_configure_assets'
  ) THEN
    ALTER TABLE user_permissions ADD COLUMN can_configure_assets boolean NOT NULL DEFAULT FALSE;
  END IF;
END $$;
