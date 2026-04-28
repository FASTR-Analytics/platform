-- =============================================================================
-- Migration 013: Drop unused results_objects.description column
--
-- This column was written at install time but never read or displayed.
-- =============================================================================

ALTER TABLE results_objects DROP COLUMN IF EXISTS description;
