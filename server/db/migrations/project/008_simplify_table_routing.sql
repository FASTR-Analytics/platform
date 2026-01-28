-- Simplify table_routing JSON to results_object_id string
-- This migration is idempotent - handles both old schema (with table_routing) and new schema (already has results_object_id)

ALTER TABLE metrics ADD COLUMN IF NOT EXISTS results_object_id text;

-- Extract default value from JSON (only if table_routing column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'metrics'
    AND column_name = 'table_routing'
  ) THEN
    UPDATE metrics
    SET results_object_id = (table_routing::json->>'default')
    WHERE table_routing IS NOT NULL AND results_object_id IS NULL;
  END IF;
END $$;

-- Drop old column if it exists
ALTER TABLE metrics DROP COLUMN IF EXISTS table_routing;

-- Make results_object_id required (only if not already set)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'metrics'
    AND column_name = 'results_object_id'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE metrics ALTER COLUMN results_object_id SET NOT NULL;
  END IF;
END $$;
