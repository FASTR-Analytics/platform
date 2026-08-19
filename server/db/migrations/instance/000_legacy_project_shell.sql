-- ============================================================================
-- LEGACY PROJECT SHELL — sorts first, runs before every other migration
-- ============================================================================
--
-- The base schema no longer has the project layer (it was dissolved into
-- products — PLAN_PRODUCTS_RESTRUCTURE D9). Migrations 001–078 were written
-- against a base that DID have it, and several of them ALTER these tables or
-- build indexes over their columns. On a FRESH database this file re-creates
-- just enough of the pre-restructure shape for those statements to resolve;
-- 079 then adds the products tables, 080 consolidates, and 081 drops the shell
-- again, leaving a schema byte-identical to the base.
--
-- On a LIVE instance every object here already exists, so the whole file is a
-- no-op.
--
-- The three ADD COLUMN lines are load-bearing and NOT redundant with the
-- CREATE TABLEs: Postgres resolves an index expression BEFORE the
-- IF NOT EXISTS name check, so 016's and 035's index statements fail without
-- their project_id column even though their CREATE TABLE IF NOT EXISTS
-- no-ops. Verified: dropping the user_logs_aggregate ALTER fails at 035,
-- dropping all three fails at 016.
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  ai_context text NOT NULL,
  is_locked boolean NOT NULL DEFAULT FALSE,
  is_central_reporting boolean NOT NULL DEFAULT FALSE,
  status text NOT NULL DEFAULT 'ready',
  deletion_scheduled_at TIMESTAMPTZ,
  run_id text,
  admin_area_2 text,
  follow_pinned boolean NOT NULL DEFAULT FALSE,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS project_user_roles (
  email text NOT NULL,
  project_id text NOT NULL,
  role text NOT NULL,
  can_configure_settings boolean NOT NULL DEFAULT FALSE,
  can_create_backups boolean NOT NULL DEFAULT FALSE,
  can_restore_backups boolean NOT NULL DEFAULT FALSE,
  can_configure_modules boolean NOT NULL DEFAULT FALSE,
  can_run_modules boolean NOT NULL DEFAULT FALSE,
  can_configure_users boolean NOT NULL DEFAULT FALSE,
  can_configure_visualizations boolean NOT NULL DEFAULT FALSE,
  can_view_visualizations boolean NOT NULL DEFAULT FALSE,
  can_configure_reports boolean NOT NULL DEFAULT FALSE,
  can_view_reports boolean NOT NULL DEFAULT FALSE,
  can_configure_slide_decks boolean NOT NULL DEFAULT FALSE,
  can_view_slide_decks boolean NOT NULL DEFAULT FALSE,
  can_configure_data boolean NOT NULL DEFAULT FALSE,
  can_view_data boolean NOT NULL DEFAULT FALSE,
  can_view_metrics boolean NOT NULL DEFAULT FALSE,
  can_view_logs boolean NOT NULL DEFAULT FALSE,
  can_view_script_code boolean NOT NULL DEFAULT FALSE,
  PRIMARY KEY (email, project_id),
  FOREIGN KEY (email) REFERENCES users (email) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_user_roles_email ON project_user_roles(email);
CREATE INDEX IF NOT EXISTS idx_project_user_roles_project_id ON project_user_roles(project_id);

ALTER TABLE user_logs ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE user_logs_aggregate ADD COLUMN IF NOT EXISTS project_id text;
