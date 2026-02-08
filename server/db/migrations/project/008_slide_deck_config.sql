-- =============================================================================
-- Migration 008: Add config column to slide_decks
-- =============================================================================

ALTER TABLE slide_decks ADD COLUMN IF NOT EXISTS config text;
