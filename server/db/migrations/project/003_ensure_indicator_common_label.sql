-- Ensure indicators table uses indicator_common_label (not indicator_label)
-- This is a safety check migration to handle any edge cases from migration 002

DO $$
BEGIN
  -- If the old column still exists, rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'indicators'
    AND column_name = 'indicator_label'
  ) THEN
    ALTER TABLE indicators
      RENAME COLUMN indicator_label TO indicator_common_label;
  END IF;

  -- If for some reason the new column doesn't exist, create it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'indicators'
    AND column_name = 'indicator_common_label'
  ) THEN
    ALTER TABLE indicators
      ADD COLUMN indicator_common_label text NOT NULL DEFAULT '';
  END IF;
END $$;
