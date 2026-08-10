-- HMIS CSV imports become runs (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase A):
-- CSV imports join dataset_hmis_import_runs — the attempt machinery
-- (dataset_hmis_upload_attempts) is deleted.

-- 1. source discriminator. Backfill via the default (every existing row is a
--    DHIS2 run), then drop the default — inserts are explicit thereafter.
ALTER TABLE dataset_hmis_import_runs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'dhis2'
  CHECK (source IN ('dhis2', 'csv'));
ALTER TABLE dataset_hmis_import_runs ALTER COLUMN source DROP DEFAULT;

-- 2. dhis2_url and selection are DHIS2-only (CSV runs have neither). The
--    source→fields pairing is enforced in code at the write boundary.
ALTER TABLE dataset_hmis_import_runs ALTER COLUMN dhis2_url DROP NOT NULL;
ALTER TABLE dataset_hmis_import_runs ALTER COLUMN selection DROP NOT NULL;

-- 3. The CSV launch payload ({ uploadToken, fileName, mappings } JSON) —
--    deliberately NOT folded into selection (that column is the DHIS2
--    selection domain).
ALTER TABLE dataset_hmis_import_runs ADD COLUMN IF NOT EXISTS csv_config text;

-- 4. Status CHECK gains 'needs_review' (dirty CSV staging holds for review;
--    the hold RELEASES the single-running slot). Drop-and-re-add is
--    idempotent; the constraint name is the Postgres default for the inline
--    CHECK in migration 057 / the base schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dataset_hmis_import_runs_status_check'
  ) THEN
    ALTER TABLE dataset_hmis_import_runs
      DROP CONSTRAINT dataset_hmis_import_runs_status_check;
  END IF;
  ALTER TABLE dataset_hmis_import_runs
    ADD CONSTRAINT dataset_hmis_import_runs_status_check
    CHECK (status IN ('queued', 'running', 'needs_review', 'complete', 'error', 'cancelled'));
END $$;

-- 5. The attempt machinery dies. Attempt rows are transient wizard state; an
--    in-flight import at deploy time dies with the restart and is relaunched
--    through the new wizard.
DROP TABLE IF EXISTS dataset_hmis_upload_attempts;
