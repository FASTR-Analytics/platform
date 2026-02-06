-- =============================================================================
-- Migration 006: Schema updates for metrics system and new features
--
-- This migration is idempotent and handles both Somalia (older) and Guinee (newer)
-- baselines, bringing both up to the current schema.
-- =============================================================================

-- =============================================================================
-- PART 1: Catch up from Somalia to Guinee baseline
-- (These may already exist on Guinee, so use IF NOT EXISTS)
-- =============================================================================

-- Add latest_ran_commit_sha to modules (from migration 005 that Somalia may not have fully)
ALTER TABLE modules ADD COLUMN IF NOT EXISTS latest_ran_commit_sha text;

-- Add example_values to indicators_hfa
ALTER TABLE indicators_hfa ADD COLUMN IF NOT EXISTS example_values text NOT NULL DEFAULT '';

-- =============================================================================
-- PART 2: New schema for metrics system
-- =============================================================================

-- Create metrics table (replaces conceptual use of results_values)
CREATE TABLE IF NOT EXISTS metrics (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL,
  label text NOT NULL,
  variant_label text,
  value_func text NOT NULL CHECK (value_func IN ('SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'identity')),
  format_as text NOT NULL CHECK (format_as IN ('percent', 'number')),
  value_props text NOT NULL,
  period_options text NOT NULL,
  required_disaggregation_options text NOT NULL,
  value_label_replacements text,
  post_aggregation_expression text,
  auto_include_facility_columns boolean DEFAULT false,
  results_object_id text NOT NULL,
  ai_description text,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_module_id ON metrics(module_id);

-- =============================================================================
-- PART 3: Visualization folders
-- =============================================================================

CREATE TABLE IF NOT EXISTS visualization_folders (
  id text PRIMARY KEY,
  label text NOT NULL,
  color text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  last_updated text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visualization_folders_sort_order ON visualization_folders(sort_order);
CREATE INDEX IF NOT EXISTS idx_visualization_folders_last_updated ON visualization_folders(last_updated);

-- =============================================================================
-- PART 4: Slide decks (AI-generated presentations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS slide_decks (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  plan text,
  last_updated text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_slide_decks_last_updated ON slide_decks(last_updated);

CREATE TABLE IF NOT EXISTS slides (
  id text PRIMARY KEY NOT NULL,
  slide_deck_id text NOT NULL,
  sort_order integer NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL,
  FOREIGN KEY (slide_deck_id) REFERENCES slide_decks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_slides_deck_id ON slides(slide_deck_id);
CREATE INDEX IF NOT EXISTS idx_slides_deck_sort ON slides(slide_deck_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_slides_last_updated ON slides(last_updated);

-- =============================================================================
-- PART 5: New columns on presentation_objects
-- =============================================================================

ALTER TABLE presentation_objects ADD COLUMN IF NOT EXISTS metric_id text;
ALTER TABLE presentation_objects ADD COLUMN IF NOT EXISTS created_by_ai boolean DEFAULT false;
ALTER TABLE presentation_objects ADD COLUMN IF NOT EXISTS folder_id text REFERENCES visualization_folders(id) ON DELETE SET NULL;
ALTER TABLE presentation_objects ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_presentation_objects_metric_id ON presentation_objects(metric_id);
CREATE INDEX IF NOT EXISTS idx_presentation_objects_folder_id ON presentation_objects(folder_id);
CREATE INDEX IF NOT EXISTS idx_presentation_objects_sort_order ON presentation_objects(sort_order);

-- =============================================================================
-- PART 6: Cleanup
-- =============================================================================

-- Note: results_values table is dropped by TypeScript migration after data is migrated
-- to ensure proper ordering (data migration first, then cleanup)
