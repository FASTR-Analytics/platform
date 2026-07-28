-- Shadow verification is removed (first-run DVS-vs-analytics cross-check):
-- retroactive edits and lagging analytics rebuilds on real DHIS2 servers
-- make DVS-analytics divergence normal, so the parity gate blocked healthy
-- instances. The dataValueSets route is the source of truth; the column and
-- the unattended gate keyed to it go away.
ALTER TABLE dataset_hmis_import_runs DROP COLUMN IF EXISTS shadow_passed;
