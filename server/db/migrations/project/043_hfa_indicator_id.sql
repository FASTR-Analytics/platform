-- PLAN_HFA_ID_VOCABULARY step 1: the HFA indicator id column is indicator_id
-- on the two indicator snapshot tables. The auto-named foreign key is renamed
-- with it so a migrated schema matches the fresh base schema.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicators_snapshot' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicators_snapshot' AND column_name = 'indicator_id') THEN
    ALTER TABLE hfa_indicators_snapshot RENAME COLUMN var_name TO indicator_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_code_snapshot' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_code_snapshot' AND column_name = 'indicator_id') THEN
    ALTER TABLE hfa_indicator_code_snapshot RENAME COLUMN var_name TO indicator_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hfa_indicator_code_snapshot_var_name_fkey') THEN
    ALTER TABLE hfa_indicator_code_snapshot
      RENAME CONSTRAINT hfa_indicator_code_snapshot_var_name_fkey TO hfa_indicator_code_snapshot_indicator_id_fkey;
  END IF;
END $$;
