-- =============================================================================
-- Migration 010: Drop unused metrics.period_options column
--
-- This column was written at install time but never read back. Tracked in
-- DOC_legacy_handling.md and PLAN for periodOptions removal.
-- =============================================================================

ALTER TABLE metrics DROP COLUMN IF EXISTS period_options;
