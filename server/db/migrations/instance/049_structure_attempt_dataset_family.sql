-- Facility imports are now per dataset family (HMIS or HFA), each writing its
-- own facilities table. The attempt row records which family the import
-- targets. Migration 050 purges legacy NULL-family rows and sets NOT NULL.
ALTER TABLE structure_upload_attempts ADD COLUMN IF NOT EXISTS dataset_family text;
