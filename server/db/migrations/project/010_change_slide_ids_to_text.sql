-- Drop foreign key constraint first (if it exists)
ALTER TABLE slides DROP CONSTRAINT IF EXISTS slides_slide_deck_id_fkey;

-- Change slide_decks.id from UUID to TEXT (idempotent - TEXT to TEXT is no-op)
ALTER TABLE slide_decks ALTER COLUMN id TYPE TEXT;

-- Change slides columns from UUID to TEXT
ALTER TABLE slides ALTER COLUMN id TYPE TEXT;
ALTER TABLE slides ALTER COLUMN slide_deck_id TYPE TEXT;

-- Recreate foreign key constraint (drop first to avoid duplicate)
ALTER TABLE slides DROP CONSTRAINT IF EXISTS slides_slide_deck_id_fkey;
ALTER TABLE slides ADD CONSTRAINT slides_slide_deck_id_fkey
  FOREIGN KEY (slide_deck_id) REFERENCES slide_decks(id) ON DELETE CASCADE;

-- Note: Existing UUID values remain valid as TEXT
-- New values will be 3-character nanoid strings
