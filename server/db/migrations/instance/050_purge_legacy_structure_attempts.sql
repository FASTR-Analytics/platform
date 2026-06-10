-- Purge any in-process upload attempt from before per-family facility imports
-- (dataset_family unset). Per DOC_MIGRATIONS: drift is fixed at deploy time —
-- runtime code never sees a family-less attempt, so the column is NOT NULL.
DELETE FROM structure_upload_attempts WHERE dataset_family IS NULL;
ALTER TABLE structure_upload_attempts ALTER COLUMN dataset_family SET NOT NULL;
