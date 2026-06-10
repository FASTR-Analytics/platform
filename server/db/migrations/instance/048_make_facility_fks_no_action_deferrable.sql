-- The facility FKs were ON DELETE RESTRICT DEFERRABLE, but RESTRICT's
-- delete-side check can never be deferred (SET CONSTRAINTS has no effect on
-- it), so the deferred delete-all in integrate_structure_from_staging.ts threw
-- whenever dataset_hmis/hfa_data had rows — the "replace all" structure import
-- strategy could never complete with data present, despite migration 029's
-- stated intent. NO ACTION (the default) defers: the delete-all + re-insert
-- runs inside one transaction and integrity is enforced at commit.
-- Constraint names are load-bearing: SET CONSTRAINTS references them by name.

ALTER TABLE dataset_hmis DROP CONSTRAINT IF EXISTS dataset_hmis_facility_id_fkey;
ALTER TABLE dataset_hmis
  ADD CONSTRAINT dataset_hmis_facility_id_fkey
  FOREIGN KEY (facility_id)
  REFERENCES facilities_hmis(facility_id)
  DEFERRABLE;

ALTER TABLE hfa_data DROP CONSTRAINT IF EXISTS hfa_data_facility_id_fkey;
ALTER TABLE hfa_data
  ADD CONSTRAINT hfa_data_facility_id_fkey
  FOREIGN KEY (facility_id)
  REFERENCES facilities_hfa(facility_id)
  DEFERRABLE;
