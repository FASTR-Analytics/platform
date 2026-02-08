-- =============================================================================
-- Migration 007: Slide deck folders
-- =============================================================================

CREATE TABLE IF NOT EXISTS slide_deck_folders (
  id text PRIMARY KEY,
  label text NOT NULL,
  color text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  last_updated text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_slide_deck_folders_sort_order ON slide_deck_folders(sort_order);

ALTER TABLE slide_decks ADD COLUMN IF NOT EXISTS folder_id text
  REFERENCES slide_deck_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_slide_decks_folder_id ON slide_decks(folder_id);
