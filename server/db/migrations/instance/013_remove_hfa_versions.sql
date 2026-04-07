ALTER TABLE dataset_hfa DROP COLUMN IF EXISTS version_id;
DROP TABLE IF EXISTS dataset_hfa_versions;
ALTER TABLE dataset_hfa_dictionary_time_points ADD COLUMN IF NOT EXISTS date_imported text;
