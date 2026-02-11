ALTER TABLE user_logs DROP CONSTRAINT IF EXISTS user_logs_user_email_fkey;
ALTER TABLE user_logs ADD CONSTRAINT user_logs_user_email_fkey FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE;

-- ============================================================================
-- Merge user_permissions columns into users table
-- ============================================================================

-- 1. Add permission columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_configure_users boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_users boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_logs boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_settings boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_assets boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_data boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_data boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_create_projects boolean NOT NULL DEFAULT FALSE;

-- 2. Copy existing permission data from user_permissions into users
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_permissions') THEN
    UPDATE users
    SET
      can_configure_users = up.can_configure_users,
      can_view_users = up.can_view_users,
      can_view_logs = up.can_view_logs,
      can_configure_settings = up.can_configure_settings,
      can_configure_assets = up.can_configure_assets,
      can_configure_data = up.can_configure_data,
      can_view_data = up.can_view_data,
      can_create_projects = up.can_create_projects
    FROM user_permissions up
    WHERE users.email = up.user_email;
  END IF;
END $$;

-- 3. Drop the user_permissions table
DROP TABLE IF EXISTS user_permissions;
