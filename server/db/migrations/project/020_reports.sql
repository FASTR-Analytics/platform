-- Reports: long-form analytical documents (markdown body + figure/image
-- registries). See PLAN_REPORTS.md. Idempotent (IF NOT EXISTS) because
-- migrations also run on fresh DBs that already have these from the base schema.

CREATE TABLE IF NOT EXISTS report_folders (
  id text PRIMARY KEY,
  label text NOT NULL,
  color text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  last_updated text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_folders_sort_order ON report_folders(sort_order);

CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  body text NOT NULL DEFAULT '',
  figures text NOT NULL DEFAULT '{}',
  images text NOT NULL DEFAULT '{}',
  config text,
  last_updated text NOT NULL,
  folder_id text REFERENCES report_folders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_last_updated ON reports(last_updated);
CREATE INDEX IF NOT EXISTS idx_reports_folder_id ON reports(folder_id);
