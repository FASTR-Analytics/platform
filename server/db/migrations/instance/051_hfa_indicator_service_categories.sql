CREATE TABLE IF NOT EXISTS hfa_indicator_service_categories (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE hfa_indicators
  ADD COLUMN IF NOT EXISTS service_category_id TEXT REFERENCES hfa_indicator_service_categories(id) ON DELETE SET NULL;
