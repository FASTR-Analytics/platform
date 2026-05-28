-- Create categories snapshot table
CREATE TABLE IF NOT EXISTS hfa_indicator_categories_snapshot (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Create sub-categories snapshot table
CREATE TABLE IF NOT EXISTS hfa_indicator_sub_categories_snapshot (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Modify indicators snapshot: add new columns
ALTER TABLE hfa_indicators_snapshot ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE hfa_indicators_snapshot ADD COLUMN IF NOT EXISTS sub_category_id TEXT;
ALTER TABLE hfa_indicators_snapshot ADD COLUMN IF NOT EXISTS short_label TEXT NOT NULL DEFAULT '';

-- Drop old category column
ALTER TABLE hfa_indicators_snapshot DROP COLUMN IF EXISTS category;
