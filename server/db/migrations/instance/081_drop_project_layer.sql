-- ============================================================================
-- DROP THE PROJECT LAYER (PLAN_PRODUCTS_RESTRUCTURE D9)
-- ============================================================================
--
-- Runs after 080 has copied every project's products into the new tables.
--
-- NEVER `DELETE FROM projects` — user_logs / ai_usage_logs /
-- user_logs_aggregate carry ON DELETE CASCADE FKs to it, so deleting rows
-- would wipe the logs. Dropping the COLUMN severs the FK first; the tables
-- then drop with their rows already orphaned by design.
--
-- The old idx_user_logs_aggregate_unique carries COALESCE(project_id, '') in
-- its expression, so DROP COLUMN takes the index with it by dependency. The
-- guarded DO block merges the rows that differed only by project_id BEFORE the
-- column goes, otherwise the rebuilt unique index would collide.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'user_logs_aggregate' AND column_name = 'project_id') THEN
    UPDATE user_logs_aggregate a SET count = m.total
    FROM (SELECT min(id) AS keep_id, sum(count) AS total FROM user_logs_aggregate
          GROUP BY user_email, endpoint, endpoint_result, week_start HAVING count(*) > 1) m
    WHERE a.id = m.keep_id;
    DELETE FROM user_logs_aggregate a
    USING (SELECT id, min(id) OVER (PARTITION BY user_email, endpoint, endpoint_result, week_start) AS keep_id
           FROM user_logs_aggregate) d
    WHERE a.id = d.id AND a.id <> d.keep_id;
  END IF;
END $$;

ALTER TABLE user_logs DROP COLUMN IF EXISTS project_id;
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS project_id;
ALTER TABLE user_logs_aggregate DROP COLUMN IF EXISTS project_id;

DROP INDEX IF EXISTS idx_user_logs_aggregate_unique;
CREATE UNIQUE INDEX idx_user_logs_aggregate_unique
  ON user_logs_aggregate (user_email, endpoint, endpoint_result, week_start);

DROP TABLE IF EXISTS dashboard_slugs, project_user_roles, projects;

ALTER TABLE users
  DROP COLUMN IF EXISTS can_create_projects,
  DROP COLUMN IF EXISTS default_project_can_configure_settings,
  DROP COLUMN IF EXISTS default_project_can_create_backups,
  DROP COLUMN IF EXISTS default_project_can_restore_backups,
  DROP COLUMN IF EXISTS default_project_can_configure_modules,
  DROP COLUMN IF EXISTS default_project_can_run_modules,
  DROP COLUMN IF EXISTS default_project_can_configure_users,
  DROP COLUMN IF EXISTS default_project_can_configure_visualizations,
  DROP COLUMN IF EXISTS default_project_can_view_visualizations,
  DROP COLUMN IF EXISTS default_project_can_configure_reports,
  DROP COLUMN IF EXISTS default_project_can_view_reports,
  DROP COLUMN IF EXISTS default_project_can_configure_slide_decks,
  DROP COLUMN IF EXISTS default_project_can_view_slide_decks,
  DROP COLUMN IF EXISTS default_project_can_configure_data,
  DROP COLUMN IF EXISTS default_project_can_view_data,
  DROP COLUMN IF EXISTS default_project_can_view_metrics,
  DROP COLUMN IF EXISTS default_project_can_view_logs,
  DROP COLUMN IF EXISTS default_project_can_view_script_code;
