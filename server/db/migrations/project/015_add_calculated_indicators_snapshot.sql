CREATE TABLE IF NOT EXISTS calculated_indicators_snapshot (
  calculated_indicator_id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  group_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  num_indicator_id TEXT NOT NULL,
  denom_kind TEXT NOT NULL,
  denom_indicator_id TEXT,
  denom_population_type TEXT,
  denom_population_multiplier DOUBLE PRECISION,
  format_as TEXT NOT NULL,
  decimal_places INTEGER NOT NULL,
  threshold_direction TEXT NOT NULL,
  threshold_green DOUBLE PRECISION NOT NULL,
  threshold_yellow DOUBLE PRECISION NOT NULL
);
