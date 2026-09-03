-- Migration 076 (per-family structure split, fleet-wide since 2026-08-18)
-- replaced the shared admin-area trees with admin_areas_hmis_1..4 /
-- admin_areas_hfa_1..4 and the global max_admin_area / facility_columns
-- config rows with structure_schema_hmis / structure_schema_hfa. It left the
-- legacy objects in place, fully detached (no reader, no writer, FKs
-- repointed), solely so a rollback to a pre-076 image kept a working read
-- path. That rollback is off the table (Tim, 2026-09-03), so they drop here.
-- Fresh installs never had them: every statement no-ops.
DROP TABLE IF EXISTS admin_areas_4;
DROP TABLE IF EXISTS admin_areas_3;
DROP TABLE IF EXISTS admin_areas_2;
DROP TABLE IF EXISTS admin_areas_1;

DELETE FROM instance_config
WHERE config_key IN ('max_admin_area', 'facility_columns');
