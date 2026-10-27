-- What a visualization's stored bundle was resolved under, copied out of the
-- bundle JSON so the product summary can tell when the snapshot no longer
-- matches the product's package or scope. 222 fills the rows that exist;
-- every bundle write keeps both in step from here on.

ALTER TABLE visualizations ADD COLUMN IF NOT EXISTS resolved_run_id text;
ALTER TABLE visualizations ADD COLUMN IF NOT EXISTS resolved_definition_hash text;
