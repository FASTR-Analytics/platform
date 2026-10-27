-- Version history for visualizations: one row per editing session's end
-- state, as report_versions and slide_deck_versions.

CREATE TABLE IF NOT EXISTS visualization_versions (
  id text PRIMARY KEY NOT NULL,
  visualization_id text NOT NULL REFERENCES visualizations(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  label text NOT NULL,
  bundle text NOT NULL,
  editors text NOT NULL DEFAULT '[]',
  content_hash text NOT NULL,
  restored_from_version_id text
);

CREATE INDEX IF NOT EXISTS idx_visualization_versions_visualization
  ON visualization_versions(visualization_id, created_at DESC);
