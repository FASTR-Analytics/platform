-- dataset_hfa was dropped in migration 023_hfa_schema_redesign.sql
-- Guard ALTER in case table doesn't exist (fresh instances)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dataset_hfa') THEN
    ALTER TABLE dataset_hfa DROP COLUMN IF EXISTS version_id;
  END IF;
END $$;

DROP TABLE IF EXISTS dataset_hfa_versions;
ALTER TABLE dataset_hfa_dictionary_time_points ADD COLUMN IF NOT EXISTS date_imported text;
