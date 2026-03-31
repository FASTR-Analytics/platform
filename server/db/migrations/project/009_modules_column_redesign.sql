-- Rename existing columns (skip if target already exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'date_installed')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'installed_at') THEN
    ALTER TABLE modules RENAME COLUMN date_installed TO installed_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'last_run')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'last_run_at') THEN
    ALTER TABLE modules RENAME COLUMN last_run TO last_run_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'latest_ran_commit_sha')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'last_run_git_ref') THEN
    ALTER TABLE modules RENAME COLUMN latest_ran_commit_sha TO last_run_git_ref;
  END IF;
END $$;

-- Drop old columns that no longer exist in the new schema
ALTER TABLE modules DROP COLUMN IF EXISTS last_updated;
ALTER TABLE modules DROP COLUMN IF EXISTS config_type;
ALTER TABLE modules DROP COLUMN IF EXISTS date_installed;
ALTER TABLE modules DROP COLUMN IF EXISTS last_run;
ALTER TABLE modules DROP COLUMN IF EXISTS latest_ran_commit_sha;

-- Add new columns
ALTER TABLE modules ADD COLUMN IF NOT EXISTS installed_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS last_run_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS last_run_git_ref text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS script_updated_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS definition_updated_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS config_updated_at text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS installed_git_ref text;
