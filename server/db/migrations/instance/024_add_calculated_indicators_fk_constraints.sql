-- Drop and recreate calculated_indicators with FK constraints
-- Safe to drop since not in production yet

DROP TABLE IF EXISTS calculated_indicators;

CREATE TABLE calculated_indicators (
  calculated_indicator_id     TEXT PRIMARY KEY NOT NULL,
  label                      TEXT NOT NULL UNIQUE,
  group_label                TEXT NOT NULL DEFAULT '',
  sort_order                 INTEGER NOT NULL DEFAULT 0,

  num_indicator_id           TEXT NOT NULL,
  denom_kind                 TEXT NOT NULL CHECK (denom_kind IN ('indicator', 'population')),
  denom_indicator_id         TEXT,
  denom_population_fraction  REAL,

  format_as                  TEXT NOT NULL DEFAULT 'percent' CHECK (format_as IN ('percent', 'number', 'rate_per_10k')),
  decimal_places             INTEGER NOT NULL DEFAULT 0,

  threshold_direction        TEXT NOT NULL DEFAULT 'higher_is_better' CHECK (threshold_direction IN ('higher_is_better', 'lower_is_better')),
  threshold_green            REAL NOT NULL,
  threshold_yellow           REAL NOT NULL,

  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    (denom_kind = 'indicator'
       AND denom_indicator_id IS NOT NULL
       AND denom_population_fraction IS NULL)
    OR
    (denom_kind = 'population'
       AND denom_indicator_id IS NULL
       AND denom_population_fraction IS NOT NULL)
  ),

  FOREIGN KEY (num_indicator_id) REFERENCES indicators(indicator_common_id) ON DELETE RESTRICT,
  FOREIGN KEY (denom_indicator_id) REFERENCES indicators(indicator_common_id) ON DELETE RESTRICT
);
