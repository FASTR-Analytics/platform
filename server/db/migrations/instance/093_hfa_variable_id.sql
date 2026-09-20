-- PLAN_HFA_ID_VOCABULARY step 2: the HFA variable id column is variable_id on
-- hfa_variables (with variable_label and variable_type), hfa_data and
-- hfa_variable_values. The auto-named composite foreign keys and the hfa_data
-- index are renamed with it so a migrated schema matches the fresh base
-- schema. The import-run diagnostics JSON is rewritten to the renamed keys.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variables' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variables' AND column_name = 'variable_id') THEN
    ALTER TABLE hfa_variables RENAME COLUMN var_name TO variable_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variables' AND column_name = 'var_label')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variables' AND column_name = 'variable_label') THEN
    ALTER TABLE hfa_variables RENAME COLUMN var_label TO variable_label;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variables' AND column_name = 'var_type')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variables' AND column_name = 'variable_type') THEN
    ALTER TABLE hfa_variables RENAME COLUMN var_type TO variable_type;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variable_values' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_variable_values' AND column_name = 'variable_id') THEN
    ALTER TABLE hfa_variable_values RENAME COLUMN var_name TO variable_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_data' AND column_name = 'var_name')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_data' AND column_name = 'variable_id') THEN
    ALTER TABLE hfa_data RENAME COLUMN var_name TO variable_id;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hfa_variable_values_time_point_var_name_fkey') THEN
    ALTER TABLE hfa_variable_values
      RENAME CONSTRAINT hfa_variable_values_time_point_var_name_fkey TO hfa_variable_values_time_point_variable_id_fkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hfa_data_time_point_var_name_fkey') THEN
    ALTER TABLE hfa_data
      RENAME CONSTRAINT hfa_data_time_point_var_name_fkey TO hfa_data_time_point_variable_id_fkey;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_hfa_data_var_name') THEN
    ALTER INDEX idx_hfa_data_var_name RENAME TO idx_hfa_data_variable_id;
  END IF;
END $$;

-- hfa_import_runs.diagnostics is a TEXT column parsed without a schema, so
-- the renamed staging-result keys are rewritten in place (idempotent: a row
-- without the old key is untouched).
UPDATE hfa_import_runs
SET diagnostics = (
  (diagnostics::jsonb - 'nDictionaryVars' - 'nXlsFormVarsNotInCsv')
    || jsonb_build_object(
      'nDictionaryVariables', diagnostics::jsonb -> 'nDictionaryVars',
      'nXlsFormQuestionsNotInCsv', diagnostics::jsonb -> 'nXlsFormVarsNotInCsv'
    )
)::text
WHERE diagnostics IS NOT NULL
  AND diagnostics::jsonb ? 'nDictionaryVars';
