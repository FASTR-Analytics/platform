-- The import route (PLAN_A4 ruling 13): the `source` column of the run and
-- ledger tables is renamed `route`, with its CHECK constraint, and the
-- staging result's `sourceType` key (on version rows and inside a CSV run's
-- run_stats) is renamed `kind`. The JSON is read by cast, not by a Zod
-- sweep, so this rewrite is the whole transform. Every step is guarded, so
-- the fresh replay (./validate_migrations) and a second run do nothing.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dataset_hmis_import_runs' AND column_name = 'source'
  ) THEN
    ALTER TABLE dataset_hmis_import_runs RENAME COLUMN source TO route;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_hmis_import_runs_source_check') THEN
    ALTER TABLE dataset_hmis_import_runs
      RENAME CONSTRAINT dataset_hmis_import_runs_source_check TO dataset_hmis_import_runs_route_check;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dataset_hmis_import_ledger' AND column_name = 'source'
  ) THEN
    ALTER TABLE dataset_hmis_import_ledger RENAME COLUMN source TO route;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dataset_hmis_import_ledger_source_check') THEN
    ALTER TABLE dataset_hmis_import_ledger
      RENAME CONSTRAINT dataset_hmis_import_ledger_source_check TO dataset_hmis_import_ledger_route_check;
  END IF;
END $$;

UPDATE dataset_hmis_versions
SET staging_result = (
  (staging_result::jsonb - 'sourceType')
  || jsonb_build_object('kind', staging_result::jsonb -> 'sourceType')
)::text
WHERE staging_result IS NOT NULL
  AND jsonb_typeof(staging_result::jsonb) = 'object'
  AND staging_result::jsonb ? 'sourceType';

UPDATE dataset_hmis_import_runs
SET run_stats = jsonb_set(run_stats::jsonb, '{csvStagingResult}',
  ((run_stats::jsonb -> 'csvStagingResult') - 'sourceType')
  || jsonb_build_object('kind', run_stats::jsonb -> 'csvStagingResult' -> 'sourceType'))::text
WHERE run_stats IS NOT NULL
  AND jsonb_typeof(run_stats::jsonb) = 'object'
  AND jsonb_typeof(run_stats::jsonb -> 'csvStagingResult') = 'object'
  AND run_stats::jsonb -> 'csvStagingResult' ? 'sourceType';
