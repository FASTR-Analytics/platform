ALTER TABLE project_user_roles
  ADD COLUMN IF NOT EXISTS can_view_script_code boolean NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_project_can_view_script_code boolean NOT NULL DEFAULT FALSE;
