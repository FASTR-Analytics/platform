-- Add new permission columns for viewing visualizations/reports and managing slide decks
ALTER TABLE project_user_roles
  ADD COLUMN IF NOT EXISTS can_view_visualizations boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_reports boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_configure_slide_decks boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_view_slide_decks boolean NOT NULL DEFAULT FALSE;
