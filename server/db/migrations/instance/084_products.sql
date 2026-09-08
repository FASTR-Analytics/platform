-- Products and folders (the products registry plus per-type detail tables).
-- Identical to the PRODUCTS AND FOLDERS block of _main_database.sql in
-- IF NOT EXISTS form. Additive only: nothing reads or writes these tables
-- yet, and the project layer is untouched.

CREATE TABLE IF NOT EXISTS folders (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  color text,
  parent_id text REFERENCES folders(id) ON DELETE SET NULL,
  created_by text,
  created_at text,
  last_updated text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL CHECK (type IN ('slide_deck', 'report')),
  label text NOT NULL,
  folder_id text REFERENCES folders(id) ON DELETE SET NULL,
  run_id text NOT NULL REFERENCES runs(id),
  admin_area_2 text,
  created_by text,
  created_at text,
  last_updated text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_folder_id ON products(folder_id);
CREATE INDEX IF NOT EXISTS idx_products_run_id ON products(run_id);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_last_updated ON products(last_updated);

CREATE TABLE IF NOT EXISTS slide_decks (
  id text PRIMARY KEY NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  plan text,
  config text
);

CREATE TABLE IF NOT EXISTS slides (
  id text PRIMARY KEY NOT NULL,
  slide_deck_id text NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL,
  crdt_state text,
  crdt_state_last_updated text
);

CREATE INDEX IF NOT EXISTS idx_slides_deck_id ON slides(slide_deck_id);
CREATE INDEX IF NOT EXISTS idx_slides_deck_sort ON slides(slide_deck_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_slides_last_updated ON slides(last_updated);

CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  figures text NOT NULL DEFAULT '{}',
  images text NOT NULL DEFAULT '{}',
  config text,
  crdt_state text,
  crdt_state_last_updated text,
  body_authors text
);

CREATE TABLE IF NOT EXISTS report_versions (
  id text PRIMARY KEY NOT NULL,
  report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  label text NOT NULL,
  body text NOT NULL,
  figures text NOT NULL DEFAULT '{}',
  images text NOT NULL DEFAULT '{}',
  editors text NOT NULL DEFAULT '[]',
  content_hash text NOT NULL,
  restored_from_version_id text,
  body_authors text
);

CREATE INDEX IF NOT EXISTS idx_report_versions_report ON report_versions(report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deck_versions (
  id text PRIMARY KEY NOT NULL,
  deck_id text NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  label text NOT NULL,
  deck_config text NOT NULL,
  slides text NOT NULL,
  editors text NOT NULL DEFAULT '[]',
  content_hash text NOT NULL,
  restored_from_version_id text,
  slide_editors text
);

CREATE INDEX IF NOT EXISTS idx_deck_versions_deck ON deck_versions(deck_id, created_at DESC);
