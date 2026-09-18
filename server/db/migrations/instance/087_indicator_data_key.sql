-- ============================================================================
-- The Uploaded indicator's data id becomes an opaque key (PLAN_A6 rulings
-- 1, 11, 12 and 13).
--
-- Every Uploaded indicator holds a key: a row whose data_id is NULL takes a
-- generated one (`u_` plus a UUID, the same shape lib's generateDataKey
-- writes) and its updated_at moves, so the dictionary stamp changes on
-- every instance that had one; a row that already holds a file code keeps
-- it, since the value is simply no longer matched against anything. The
-- CHECK then requires a data id on every Uploaded row.
--
-- The CSV staging result's validation block loses unknownIndicators and
-- gains skippedByMapping where it is stored (dataset_hmis_versions.
-- staging_result and dataset_hmis_import_runs.run_stats ->
-- 'csvStagingResult'); the rows once dropped as unknown are carried as the
-- rows dropped, so the drop accounting still adds up. Each UPDATE is gated
-- on the old key's presence, so a replay matches nothing.
--
-- Every queued or held CSV run is cancelled: its config has no mapping and
-- a hold's third action no longer exists, and a CSV import is cheap to
-- relaunch. A held run's surviving staging table is dropped here, since no
-- boot sweep touches a needs_review row. DHIS2 runs are untouched.
--
-- Fresh replay (./validate_migrations): every UPDATE matches no row and the
-- constraint is re-created as _main_database.sql declares it.
-- ============================================================================

UPDATE indicators
SET data_id = 'u_' || gen_random_uuid()::text, updated_at = CURRENT_TIMESTAMP
WHERE definition_type = 'uploaded' AND data_id IS NULL;

ALTER TABLE indicators DROP CONSTRAINT IF EXISTS indicators_fields_check;
ALTER TABLE indicators ADD CONSTRAINT indicators_fields_check CHECK (
  (definition_type = 'uploaded'      AND expression IS NULL AND data_id IS NOT NULL) OR
  (definition_type = 'dhis2_element' AND expression IS NULL AND data_id IS NOT NULL) OR
  (definition_type = 'sum'           AND expression IS NULL AND data_id IS NULL) OR
  (definition_type = 'derived'       AND expression IS NOT NULL AND data_id IS NULL)
);

UPDATE dataset_hmis_versions
SET staging_result = jsonb_set(
  (staging_result::jsonb #- '{validation,unknownIndicators}'),
  '{validation,skippedByMapping}',
  jsonb_build_object('rowsDropped', COALESCE(staging_result::jsonb -> 'validation' -> 'unknownIndicators' -> 'rowsDropped', '0'::jsonb))
)::text
WHERE staging_result IS NOT NULL
  AND jsonb_typeof(staging_result::jsonb) = 'object'
  AND staging_result::jsonb -> 'validation' ? 'unknownIndicators';

UPDATE dataset_hmis_import_runs
SET run_stats = jsonb_set(
  (run_stats::jsonb #- '{csvStagingResult,validation,unknownIndicators}'),
  '{csvStagingResult,validation,skippedByMapping}',
  jsonb_build_object('rowsDropped', COALESCE(run_stats::jsonb -> 'csvStagingResult' -> 'validation' -> 'unknownIndicators' -> 'rowsDropped', '0'::jsonb))
)::text
WHERE run_stats IS NOT NULL
  AND jsonb_typeof(run_stats::jsonb) = 'object'
  AND run_stats::jsonb -> 'csvStagingResult' -> 'validation' ? 'unknownIndicators';

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM dataset_hmis_import_runs
    WHERE route = 'csv' AND status = 'needs_review'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I', 'uploaded_hmis_data_staging_ready_for_integration_run_' || r.id);
  END LOOP;
END $$;

UPDATE dataset_hmis_import_runs
SET status = 'cancelled', ended_at = now(), progress = NULL,
  error = 'Cancelled by the release that added the CSV mapping step: this run was launched before it. Start the import again.'
WHERE route = 'csv' AND status IN ('queued', 'needs_review');
