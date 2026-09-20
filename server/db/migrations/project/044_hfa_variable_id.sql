-- PLAN_HFA_ID_VOCABULARY step 2: the HFA variable id column is variable_id on
-- hfa_variable_values_snapshot and indicators_hfa. Both tables carry only
-- their primary key, which does not name the column, so no constraint is
-- renamed.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variable_values_snapshot' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variable_values_snapshot' AND column_name = 'variable_id') THEN
    ALTER TABLE hfa_variable_values_snapshot RENAME COLUMN var_name TO variable_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'indicators_hfa' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'indicators_hfa' AND column_name = 'variable_id') THEN
    ALTER TABLE indicators_hfa RENAME COLUMN var_name TO variable_id;
  END IF;
END $$;
