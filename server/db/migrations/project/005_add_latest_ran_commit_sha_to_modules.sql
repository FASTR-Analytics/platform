-- Add latest_ran_commit_sha column to track the commit SHA from the last time the module was run
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'modules'
    AND column_name = 'latest_ran_commit_sha'
  ) THEN
    ALTER TABLE modules ADD COLUMN latest_ran_commit_sha text;
  END IF;
END $$;
