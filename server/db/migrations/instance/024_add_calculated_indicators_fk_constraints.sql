-- Add FK constraints to calculated_indicators if missing
-- Only recreate table if it lacks FK constraints (for instances that had pre-FK version)
-- Skip if table already has FKs (base schema or already migrated)

DO $$
BEGIN
  -- Check if FK constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'calculated_indicators'
      AND c.contype = 'f'
      AND c.conname LIKE '%num_indicator_id%'
  ) THEN
    -- Table exists but lacks FKs - drop and recreate with current schema
    DROP TABLE IF EXISTS calculated_indicators;

    CREATE TABLE calculated_indicators (
      calculated_indicator_id     TEXT PRIMARY KEY NOT NULL,
      label                      TEXT NOT NULL UNIQUE,
      group_label                TEXT NOT NULL DEFAULT '',
      sort_order                 INTEGER NOT NULL DEFAULT 0,

      num_indicator_id           TEXT NOT NULL,
      denom_kind                 TEXT NOT NULL,
      denom_indicator_id         TEXT,
      denom_population_type      TEXT,
      denom_population_multiplier REAL,

      format_as                  TEXT NOT NULL DEFAULT 'percent' CHECK (format_as IN ('percent', 'number', 'rate_per_10k')),
      decimal_places             INTEGER NOT NULL DEFAULT 0,

      threshold_direction        TEXT NOT NULL DEFAULT 'higher_is_better' CHECK (threshold_direction IN ('higher_is_better', 'lower_is_better')),
      threshold_green            REAL NOT NULL,
      threshold_yellow           REAL NOT NULL,

      updated_at                 TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT calculated_indicators_check CHECK (denom_kind IN ('none', 'indicator', 'population')),

      CONSTRAINT calculated_indicators_denom_fields_check CHECK (
        (denom_kind = 'none'
           AND denom_indicator_id IS NULL
           AND denom_population_type IS NULL
           AND denom_population_multiplier IS NULL)
        OR
        (denom_kind = 'indicator'
           AND denom_indicator_id IS NOT NULL
           AND denom_population_type IS NULL
           AND denom_population_multiplier IS NULL)
        OR
        (denom_kind = 'population'
           AND denom_indicator_id IS NULL
           AND denom_population_type IS NOT NULL
           AND denom_population_multiplier IS NOT NULL)
      ),

      FOREIGN KEY (num_indicator_id) REFERENCES indicators(indicator_common_id) ON DELETE RESTRICT,
      FOREIGN KEY (denom_indicator_id) REFERENCES indicators(indicator_common_id) ON DELETE RESTRICT
    );
  END IF;
END $$;
