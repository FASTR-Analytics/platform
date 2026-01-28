-- Create slide_decks table (separate from reports)
CREATE TABLE IF NOT EXISTS slide_decks (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  plan TEXT,
  last_updated TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slide_decks_last_updated_idx ON slide_decks(last_updated);

-- Create slides table
CREATE TABLE IF NOT EXISTS slides (
  id TEXT PRIMARY KEY,
  slide_deck_id TEXT NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  config JSONB NOT NULL,
  last_updated TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slides_deck_id_idx ON slides(slide_deck_id);
CREATE INDEX IF NOT EXISTS slides_deck_sort_idx ON slides(slide_deck_id, sort_order);
CREATE INDEX IF NOT EXISTS slides_last_updated_idx ON slides(last_updated);
