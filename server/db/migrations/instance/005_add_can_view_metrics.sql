ALTER TABLE project_user_roles
  ADD COLUMN IF NOT EXISTS can_view_metrics boolean NOT NULL DEFAULT FALSE;
