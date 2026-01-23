-- Create slide_decks table (separate from reports)
CREATE TABLE slide_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  plan TEXT,
  last_updated TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX slide_decks_last_updated_idx ON slide_decks(last_updated);

-- Create slides table
CREATE TABLE slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slide_deck_id UUID NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  config JSONB NOT NULL,
  last_updated TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX slides_deck_id_idx ON slides(slide_deck_id);
CREATE INDEX slides_deck_sort_idx ON slides(slide_deck_id, sort_order);
CREATE INDEX slides_last_updated_idx ON slides(last_updated);
