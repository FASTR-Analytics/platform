-- PLAN_DHIS2_CREDENTIAL_STORE_CONSOLIDATION Phase 1: generalize the stored
-- DHIS2 credentials table from HMIS-data-import-only to instance-wide (every
-- DHIS2 flow — structure, indicators, geojson, HMIS data — shares one
-- singleton row).
-- On a fresh DB, the base schema already has instance_dhis2_credentials (no
-- rename needed) but migration 058 (unrewritten, per PROTOCOL_APP_MIGRATIONS)
-- still fires its own CREATE TABLE IF NOT EXISTS for the old name, leaving an
-- empty, never-populated old-named table alongside it — drop that leftover.
-- On a real deployed DB, only the old name exists (with real data) — rename.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'dataset_hmis_dhis2_credentials'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'instance_dhis2_credentials'
  ) THEN
    DROP TABLE dataset_hmis_dhis2_credentials;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'dataset_hmis_dhis2_credentials'
  ) THEN
    ALTER TABLE dataset_hmis_dhis2_credentials RENAME TO instance_dhis2_credentials;
  END IF;
END $$;
