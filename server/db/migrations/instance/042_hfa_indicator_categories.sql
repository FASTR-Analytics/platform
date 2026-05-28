-- Create categories table
CREATE TABLE IF NOT EXISTS hfa_indicator_categories (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Create sub-categories table
CREATE TABLE IF NOT EXISTS hfa_indicator_sub_categories (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES hfa_indicator_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Add new columns to hfa_indicators (all nullable initially)
ALTER TABLE hfa_indicators ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE hfa_indicators ADD COLUMN IF NOT EXISTS sub_category_id TEXT;
ALTER TABLE hfa_indicators ADD COLUMN IF NOT EXISTS short_label TEXT NOT NULL DEFAULT '';

-- Migrate existing non-empty categories from hfa_indicators to new table (only if old category column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hfa_indicators' AND column_name = 'category') THEN
    INSERT INTO hfa_indicator_categories (id, label, sort_order)
    SELECT DISTINCT
      LOWER(REPLACE(REPLACE(category, ' ', '_'), '-', '_')) AS id,
      category AS label,
      0 AS sort_order
    FROM hfa_indicators
    WHERE category IS NOT NULL AND category != ''
    ON CONFLICT (id) DO NOTHING;

    -- Populate category_id from existing category text (NULL if empty)
    UPDATE hfa_indicators
    SET category_id = CASE
      WHEN category IS NULL OR category = '' THEN NULL
      ELSE LOWER(REPLACE(REPLACE(category, ' ', '_'), '-', '_'))
    END
    WHERE category_id IS NULL;
  END IF;
END $$;

-- sub_category_id stays NULL (no default assignment)

-- Add foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hfa_indicators_category_id_fkey'
  ) THEN
    ALTER TABLE hfa_indicators
    ADD CONSTRAINT hfa_indicators_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES hfa_indicator_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hfa_indicators_sub_category_id_fkey'
  ) THEN
    ALTER TABLE hfa_indicators
    ADD CONSTRAINT hfa_indicators_sub_category_id_fkey
    FOREIGN KEY (sub_category_id) REFERENCES hfa_indicator_sub_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add CHECK constraint: sub_category_id requires category_id to be set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hfa_indicators_sub_category_requires_category'
  ) THEN
    ALTER TABLE hfa_indicators
    ADD CONSTRAINT hfa_indicators_sub_category_requires_category
    CHECK (sub_category_id IS NULL OR category_id IS NOT NULL);
  END IF;
END $$;

-- Drop old category column (after migration complete)
ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS category;
