-- A DHIS2 facility value that is not a non-negative integer is skipped at
-- import and counted on the pair's ledger row, with a sample of at most 10
-- { facilityId, value } as JSON; the pair still integrates. Failing the pair
-- would block the source-month for every facility in the country on one
-- facility's decimal.

ALTER TABLE dataset_hmis_import_ledger
  ADD COLUMN IF NOT EXISTS skipped_values integer NOT NULL DEFAULT 0;
ALTER TABLE dataset_hmis_import_ledger
  ADD COLUMN IF NOT EXISTS skipped_values_sample text NOT NULL DEFAULT '[]';
