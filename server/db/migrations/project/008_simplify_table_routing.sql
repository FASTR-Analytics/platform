-- Simplify table_routing JSON to results_object_id string
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS results_object_id text;

-- Extract default value from JSON
UPDATE metrics
SET results_object_id = (table_routing::json->>'default')
WHERE table_routing IS NOT NULL AND results_object_id IS NULL;

-- Drop old column
ALTER TABLE metrics DROP COLUMN IF EXISTS table_routing;

-- Make results_object_id required
ALTER TABLE metrics ALTER COLUMN results_object_id SET NOT NULL;
