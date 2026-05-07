-- Add new columns (idempotent)
ALTER TABLE calculated_indicators_snapshot
  ADD COLUMN IF NOT EXISTS denom_population_type TEXT,
  ADD COLUMN IF NOT EXISTS denom_population_multiplier DOUBLE PRECISION;

-- Migrate existing data: fraction → total_population with that fraction as multiplier
-- Only run if old column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'calculated_indicators_snapshot'
             AND column_name = 'denom_population_fraction') THEN
    UPDATE calculated_indicators_snapshot
    SET denom_population_type = 'total_population',
        denom_population_multiplier = denom_population_fraction
    WHERE denom_kind = 'population'
      AND denom_population_type IS NULL;

    ALTER TABLE calculated_indicators_snapshot DROP COLUMN denom_population_fraction;
  END IF;
END $$;
