-- The CSV columns (PLAN_A4 ruling 13): the `mappings` key of a CSV run's
-- csv_config ({ fileName, filePin, columns }) is renamed `columns`. Read by
-- cast, not by a Zod sweep, so this rewrite is the whole transform. Matches
-- no row on a fresh install or a second run.

UPDATE dataset_hmis_import_runs
SET csv_config = (
  (csv_config::jsonb - 'mappings')
  || jsonb_build_object('columns', csv_config::jsonb -> 'mappings')
)::text
WHERE csv_config IS NOT NULL
  AND jsonb_typeof(csv_config::jsonb) = 'object'
  AND csv_config::jsonb ? 'mappings';
