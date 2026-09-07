-- =============================================================================
-- Migration 010: Drop unused metrics.period_options column
--
-- This column was written at install time but never read back. Tracked in
-- DOC_legacy_handling.md and PLAN for periodOptions removal.
-- =============================================================================

-- Guarded on the metrics table: absent on a fresh DB since 041.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'metrics'
  ) THEN
    ALTER TABLE metrics DROP COLUMN IF EXISTS period_options;
  END IF;
END $$;
