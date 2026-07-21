-- Version history snapshots (Google-Docs-style) for reports and slide decks.
-- One row = one editing-session version: full content snapshot + the editors
-- who contributed during that window. Consecutive-duplicate writes are skipped
-- via content_hash; only the newest 100 per document are kept (pruned at
-- write). editors: JSON [{email, name}]. restored_from_version_id marks
-- versions created by a restore (points at the version that was restored).

CREATE TABLE IF NOT EXISTS report_versions (
  id text PRIMARY KEY,
  report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  label text NOT NULL,
  body text NOT NULL,
  figures text NOT NULL DEFAULT '{}',
  images text NOT NULL DEFAULT '{}',
  editors text NOT NULL DEFAULT '[]',
  content_hash text NOT NULL,
  restored_from_version_id text
);
CREATE INDEX IF NOT EXISTS idx_report_versions_report
  ON report_versions(report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deck_versions (
  id text PRIMARY KEY,
  deck_id text NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  label text NOT NULL,
  deck_config text NOT NULL,
  slides text NOT NULL,
  editors text NOT NULL DEFAULT '[]',
  content_hash text NOT NULL,
  restored_from_version_id text
);
CREATE INDEX IF NOT EXISTS idx_deck_versions_deck
  ON deck_versions(deck_id, created_at DESC);
