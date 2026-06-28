-- Re-key structure_upload_attempts by dataset_family so HMIS and HFA structure
-- imports are independent and each resumable, instead of a single global
-- 'single_row' slot that let only one run at a time.
--
-- Idempotent: the guards below make it a no-op on fresh installs that already
-- have the final shape from _main_database.sql.

ALTER TABLE structure_upload_attempts DROP COLUMN IF EXISTS id CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'structure_upload_attempts'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE structure_upload_attempts ADD PRIMARY KEY (dataset_family);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'structure_upload_attempts_family_check'
  ) THEN
    ALTER TABLE structure_upload_attempts
      ADD CONSTRAINT structure_upload_attempts_family_check
      CHECK (dataset_family IN ('hmis', 'hfa'));
  END IF;
END $$;
