-- PLAN_HFA_ID_VOCABULARY step 1: the HFA indicator id column is indicator_id
-- on hfa_indicators and its two code tables. The auto-named foreign keys are
-- renamed with it so a migrated schema matches the fresh base schema.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicators' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicators' AND column_name = 'indicator_id') THEN
    ALTER TABLE hfa_indicators RENAME COLUMN var_name TO indicator_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_code' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_code' AND column_name = 'indicator_id') THEN
    ALTER TABLE hfa_indicator_code RENAME COLUMN var_name TO indicator_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_variant_code' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_variant_code' AND column_name = 'indicator_id') THEN
    ALTER TABLE hfa_indicator_variant_code RENAME COLUMN var_name TO indicator_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hfa_indicator_code_var_name_fkey') THEN
    ALTER TABLE hfa_indicator_code
      RENAME CONSTRAINT hfa_indicator_code_var_name_fkey TO hfa_indicator_code_indicator_id_fkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hfa_indicator_variant_code_var_name_fkey') THEN
    ALTER TABLE hfa_indicator_variant_code
      RENAME CONSTRAINT hfa_indicator_variant_code_var_name_fkey TO hfa_indicator_variant_code_indicator_id_fkey;
  END IF;
END $$;
