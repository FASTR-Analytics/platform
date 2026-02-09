-- ============================================================================
-- Consolidated migration: replaces migrations 004 through 012
-- Fully idempotent — safe to run on instances that have partially applied
-- the original migrations.
-- ============================================================================

-- ============================================================================
-- 1. Create user_logs table (from 004_add_user_logs_table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_logs (
  id SERIAL PRIMARY KEY,
  user_email text NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint text NOT NULL,
  endpoint_result text NOT NULL,
  FOREIGN KEY (user_email) REFERENCES users(email)
);

-- ============================================================================
-- 2. Add details column to user_logs (from 005_add_details_column_to_user_logs)
-- ============================================================================
ALTER TABLE user_logs ADD COLUMN IF NOT EXISTS details text;

-- ============================================================================
-- 3. Drop audit_logs table (from 006_delete_audit_logs)
-- ============================================================================
DROP TABLE IF EXISTS audit_logs;

-- ============================================================================
-- 4. Add permission columns to project_user_roles (from 007_alter_project_user_roles)
-- ============================================================================
ALTER TABLE project_user_roles
  ADD COLUMN IF NOT EXISTS can_configure_settings boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_create_backups boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_restore_backups boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_modules boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_run_modules boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_users boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_reports boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_data boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_data boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_logs boolean NOT NULL DEFAULT FALSE;

-- ============================================================================
-- 5. Add project_id to user_logs (from 008_add_project_id_to_user_logs)
-- ============================================================================
ALTER TABLE user_logs ADD COLUMN IF NOT EXISTS project_id text;

-- Add foreign key constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_user_logs_project_id'
      AND table_name = 'user_logs'
  ) THEN
    ALTER TABLE user_logs
      ADD CONSTRAINT fk_user_logs_project_id
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add index if it doesn't already exist
CREATE INDEX IF NOT EXISTS idx_user_logs_project_id ON user_logs(project_id) WHERE project_id IS NOT NULL;

-- ============================================================================
-- 6. Create user_permissions table (from 009_add_user_permissions_table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_permissions (
  user_email text PRIMARY KEY NOT NULL,
  can_configure_users boolean NOT NULL DEFAULT FALSE,
  can_view_users boolean NOT NULL DEFAULT FALSE,
  can_view_logs boolean NOT NULL DEFAULT FALSE,
  can_configure_settings boolean NOT NULL DEFAULT FALSE,
  can_configure_assets boolean NOT NULL DEFAULT FALSE,
  can_configure_data boolean NOT NULL DEFAULT FALSE,
  can_view_data boolean NOT NULL DEFAULT FALSE,
  can_create_projects boolean NOT NULL DEFAULT FALSE,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
);

-- ============================================================================
-- 7. Fix user_permissions columns (from 010_alter_user_permissions_columns)
--    Handle case where 009 was run with old column name 'can_configure_instance'
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'can_configure_instance'
  ) THEN
    ALTER TABLE user_permissions RENAME COLUMN can_configure_instance TO can_configure_settings;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_permissions' AND column_name = 'can_configure_assets'
  ) THEN
    ALTER TABLE user_permissions ADD COLUMN can_configure_assets boolean NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- ============================================================================
-- 8. Rename misspelled column (from 011_rename_visulizations_column)
--    Also handles the case where the column was already added with correct spelling
--    or was added with the misspelling from step 4 above
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_user_roles' AND column_name = 'can_configure_visulizations'
  ) THEN
    ALTER TABLE project_user_roles
      RENAME COLUMN can_configure_visulizations TO can_configure_visualizations;
  END IF;
END $$;

-- Ensure the correctly-spelled column exists (for fresh instances where step 4
-- didn't add the misspelled version)
ALTER TABLE project_user_roles
  ADD COLUMN IF NOT EXISTS can_configure_visualizations boolean NOT NULL DEFAULT FALSE;

-- ============================================================================
-- 9. Add view and slide deck permissions (from 012_add_view_and_slide_deck_permissions)
-- ============================================================================
ALTER TABLE project_user_roles
  ADD COLUMN IF NOT EXISTS can_view_visualizations boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_reports boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_slide_decks boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_slide_decks boolean NOT NULL DEFAULT FALSE;
