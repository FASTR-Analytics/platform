CREATE TABLE IF NOT EXISTS hfa_indicator_service_categories_snapshot (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE hfa_indicators_snapshot ADD COLUMN IF NOT EXISTS service_category_id text;
