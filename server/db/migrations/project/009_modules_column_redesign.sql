-- Rename existing columns
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'date_installed') THEN
    ALTER TABLE modules RENAME COLUMN date_installed TO installed_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'last_run') THEN
    ALTER TABLE modules RENAME COLUMN last_run TO last_run_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'latest_ran_commit_sha') THEN
    ALTER TABLE modules RENAME COLUMN latest_ran_commit_sha TO last_run_git_ref;
  END IF;
END $$;

-- Drop unused columns
ALTER TABLE modules DROP COLUMN IF EXISTS last_updated;
ALTER TABLE modules DROP COLUMN IF EXISTS config_type;

-- Add new columns
ALTER TABLE modules ADD COLUMN IF NOT EXISTS script_updated_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS definition_updated_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS config_updated_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS installed_git_ref text;
