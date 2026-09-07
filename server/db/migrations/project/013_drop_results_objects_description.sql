-- =============================================================================
-- Migration 013: Drop unused results_objects.description column
--
-- This column was written at install time but never read or displayed.
-- =============================================================================

-- Guarded on the results_objects table: absent on a fresh DB since 041.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'results_objects'
  ) THEN
    ALTER TABLE results_objects DROP COLUMN IF EXISTS description;
  END IF;
END $$;
