-- Global registry mapping a public dashboard slug to its (project, dashboard).
-- Dashboards live in per-project databases and their `id` is only unique within
-- a project, so the slug (globally unique) is what lets the public route resolve
-- a bare /d/:slug URL to the right project DB without a projectId in the path.
CREATE TABLE IF NOT EXISTS dashboard_slugs (
  slug text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  dashboard_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE (project_id, dashboard_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_slugs_project ON dashboard_slugs(project_id);
