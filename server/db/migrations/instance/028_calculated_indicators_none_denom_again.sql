-- Update CHECK constraints to allow denom_kind = 'none' (idempotent)
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop ALL check constraints on the table (inline + named)
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'calculated_indicators'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE calculated_indicators DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;

  -- Re-add the combined constraint
  ALTER TABLE calculated_indicators ADD CONSTRAINT calculated_indicators_check CHECK (
    denom_kind IN ('none', 'indicator', 'population')
  );

  ALTER TABLE calculated_indicators ADD CONSTRAINT calculated_indicators_denom_fields_check CHECK (
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