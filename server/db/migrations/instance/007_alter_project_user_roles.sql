ALTER TABLE project_user_roles
  ADD COLUMN IF NOT EXISTS can_configure_settings boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_create_backups boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_restore_backups boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_modules boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_run_modules boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_users boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_visulizations boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_reports boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_data boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_data boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_logs boolean NOT NULL DEFAULT FALSE;
