-- Per-attempt value recodes (column → facility_id → new value), authored in
-- the review step between staging and import. Cleared with step_3_result.
ALTER TABLE structure_upload_attempts ADD COLUMN IF NOT EXISTS recodes text;
