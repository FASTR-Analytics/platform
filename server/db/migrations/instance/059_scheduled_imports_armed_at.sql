-- Phase 4 review finding 1 (PLAN_DHIS2_IMPORTER Status block): occurrences
-- from before a schedule existed / was last armed must never fire or count
-- as missed. armed_at is stamped on create, on enable, and on every edit;
-- the scheduler tick treats occurrences before it as simply not due.
ALTER TABLE dataset_hmis_scheduled_imports
  ADD COLUMN IF NOT EXISTS armed_at timestamptz NOT NULL DEFAULT now();
