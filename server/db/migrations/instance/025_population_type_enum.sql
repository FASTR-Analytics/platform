-- Add new columns (idempotent)
ALTER TABLE calculated_indicators
  ADD COLUMN IF NOT EXISTS denom_population_type TEXT,
  ADD COLUMN IF NOT EXISTS denom_population_multiplier REAL;

-- Migrate existing data: fraction → total_population with that fraction as multiplier
UPDATE calculated_indicators
SET denom_population_type = 'total_population',
    denom_population_multiplier = denom_population_fraction
WHERE denom_kind = 'population'
  AND denom_population_type IS NULL;

-- Drop old column (idempotent via DO block)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'calculated_indicators'
             AND column_name = 'denom_population_fraction') THEN
    ALTER TABLE calculated_indicators DROP COLUMN denom_population_fraction;
  END IF;
END $$;

-- Update CHECK constraint (drop old, add new)
ALTER TABLE calculated_indicators DROP CONSTRAINT IF EXISTS calculated_indicators_check;

ALTER TABLE calculated_indicators ADD CONSTRAINT calculated_indicators_check CHECK (
  (denom_kind = 'indicator'
     AND denom_indicator_id IS NOT NULL
     AND denom_population_type IS NULL
     AND denom_population_multiplier IS NULL)
  OR
  (denom_kind = 'population'
     AND denom_indicator_id IS NULL
     AND denom_population_type IS NOT NULL
     AND denom_population_multiplier IS NOT NULL)
);
