-- The structure import is HMIS-only: HFA facilities come from each round's
-- data import. The HFA attempt and its staging table go, and the table holds
-- at most one attempt, keyed on a fixed slot. The slot's name is one no
-- earlier migration drops (054 drops id), so a fresh replay leaves it alone.
--
-- Idempotent: on a fresh install, 049 to 054 re-add dataset_family to the
-- final shape from _main_database.sql, and this drops it again.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'structure_upload_attempts'
      AND column_name = 'dataset_family'
  ) THEN
    DELETE FROM structure_upload_attempts WHERE dataset_family <> 'hmis';
  END IF;
END $$;

DROP TABLE IF EXISTS temp_structure_staging_hfa;

ALTER TABLE structure_upload_attempts
  ADD COLUMN IF NOT EXISTS slot text NOT NULL DEFAULT 'single'
  CONSTRAINT structure_upload_attempts_slot_check CHECK (slot = 'single');

ALTER TABLE structure_upload_attempts DROP COLUMN IF EXISTS dataset_family CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'structure_upload_attempts'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE structure_upload_attempts
      ADD CONSTRAINT structure_upload_attempts_pkey PRIMARY KEY (slot);
  END IF;
END $$;
