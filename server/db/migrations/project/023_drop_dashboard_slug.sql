-- Slugs now live in the main DB (instance migration 043_dashboard_slugs) so a
-- public dashboard can be resolved from a bare /d/:slug URL. The per-project
-- column is no longer the source of truth and is removed to avoid drift.
DROP INDEX IF EXISTS idx_dashboards_slug;
ALTER TABLE dashboards DROP COLUMN IF EXISTS slug;
