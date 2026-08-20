-- Custom report styles: user-authored AI design briefs for HTML-format
-- reports (SYSTEM_12). Stored in the MAIN database because a style's
-- visibility can span projects (project_ids NULL = every project on the
-- instance; else a JSON array of project uuids). Reports snapshot the brief
-- into their config at creation and resolve the live row while it remains
-- visible (live ref + snapshot fallback).

CREATE TABLE IF NOT EXISTS report_styles (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  brief text NOT NULL,
  colors text,
  project_ids text,
  last_updated timestamptz NOT NULL DEFAULT now()
);
