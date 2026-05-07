-- Update CHECK constraint to allow denom_kind = 'none' (idempotent)
DO $$
BEGIN
  ALTER TABLE calculated_indicators DROP CONSTRAINT IF EXISTS calculated_indicators_check;

  ALTER TABLE calculated_indicators ADD CONSTRAINT calculated_indicators_check CHECK (
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
  );
END $$;