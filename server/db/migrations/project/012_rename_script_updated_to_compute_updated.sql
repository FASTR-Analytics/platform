-- Rename script_updated_at to compute_updated_at
-- This column tracks when compute-affecting changes were made (script, configRequirements, resultsObjects)
-- Used to determine if results are stale (last_run_at < compute_updated_at)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'script_updated_at'
  ) THEN
    ALTER TABLE modules RENAME COLUMN script_updated_at TO compute_updated_at;
  END IF;
END $$;

ALTER TABLE modules ADD COLUMN IF NOT EXISTS compute_updated_at text;
