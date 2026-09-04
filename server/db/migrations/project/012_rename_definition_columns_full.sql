-- Rename and add columns for clearer compute vs presentation definition tracking
-- compute_def_* tracks script, configRequirements, resultsObjects changes
-- presentation_def_* tracks metrics, vizPresets, label, etc. changes

-- Whole file guarded on the modules table: absent on a fresh DB since 041.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'modules'
  ) THEN
    RETURN;
  END IF;

  -- Rename script_updated_at -> compute_def_updated_at (if source exists and target doesn't)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'script_updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'compute_def_updated_at'
  ) THEN
    ALTER TABLE modules RENAME COLUMN script_updated_at TO compute_def_updated_at;
  END IF;

  -- Rename compute_updated_at -> compute_def_updated_at (if source exists and target doesn't)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'compute_updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'compute_def_updated_at'
  ) THEN
    ALTER TABLE modules RENAME COLUMN compute_updated_at TO compute_def_updated_at;
  END IF;

  -- Rename definition_updated_at -> presentation_def_updated_at (if source exists and target doesn't)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'definition_updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'presentation_def_updated_at'
  ) THEN
    ALTER TABLE modules RENAME COLUMN definition_updated_at TO presentation_def_updated_at;
  END IF;

  -- Rename installed_git_ref -> presentation_def_git_ref (if source exists and target doesn't)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'installed_git_ref'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'presentation_def_git_ref'
  ) THEN
    ALTER TABLE modules RENAME COLUMN installed_git_ref TO presentation_def_git_ref;
  END IF;

  -- Rename compute_git_ref -> compute_def_git_ref (if source exists and target doesn't)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'compute_git_ref'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'compute_def_git_ref'
  ) THEN
    ALTER TABLE modules RENAME COLUMN compute_git_ref TO compute_def_git_ref;
  END IF;

  -- Drop installed_at (redundant with presentation_def_updated_at)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'installed_at'
  ) THEN
    ALTER TABLE modules DROP COLUMN installed_at;
  END IF;

  -- Drop orphan source columns only if target exists (safe cleanup)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'script_updated_at'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'compute_def_updated_at'
  ) THEN
    ALTER TABLE modules DROP COLUMN script_updated_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'definition_updated_at'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'presentation_def_updated_at'
  ) THEN
    ALTER TABLE modules DROP COLUMN definition_updated_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'installed_git_ref'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'modules' AND column_name = 'presentation_def_git_ref'
  ) THEN
    ALTER TABLE modules DROP COLUMN installed_git_ref;
  END IF;

  -- Add new columns if they don't exist
  ALTER TABLE modules ADD COLUMN IF NOT EXISTS compute_def_updated_at text;
  ALTER TABLE modules ADD COLUMN IF NOT EXISTS compute_def_git_ref text;
  ALTER TABLE modules ADD COLUMN IF NOT EXISTS presentation_def_updated_at text;
  ALTER TABLE modules ADD COLUMN IF NOT EXISTS presentation_def_git_ref text;
END $$;
