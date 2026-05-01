-- ============================================================================
-- DATASET MANAGEMENT
-- ============================================================================

CREATE TABLE datasets (
  dataset_type text PRIMARY KEY NOT NULL,
  info text NOT NULL,
  last_updated text NOT NULL
);

CREATE TABLE indicators (
  indicator_common_id text PRIMARY KEY NOT NULL,
  indicator_common_label text NOT NULL
);

CREATE TABLE indicators_hfa (
  var_name text PRIMARY KEY NOT NULL,
  example_values text NOT NULL
);

-- Point-in-time snapshot of HFA indicator definitions + per-time-point R code,
-- copied from the instance DB at HFA data export time. The module runner reads
-- from these tables so indicators and data always stay in sync.
CREATE TABLE hfa_indicators_snapshot (
  var_name text PRIMARY KEY NOT NULL,
  category text NOT NULL,
  definition text NOT NULL,
  type text NOT NULL,
  aggregation text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE hfa_indicator_code_snapshot (
  var_name text NOT NULL,
  time_point text NOT NULL,
  r_code text NOT NULL DEFAULT '',
  r_filter_code text,
  PRIMARY KEY (var_name, time_point),
  FOREIGN KEY (var_name) REFERENCES hfa_indicators_snapshot(var_name) ON DELETE CASCADE
);

CREATE TABLE facilities (
  facility_id text PRIMARY KEY NOT NULL,
  admin_area_4 text NOT NULL,
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  -- Optional metadata columns
  facility_name text,
  facility_type text,
  facility_ownership text,
  facility_custom_1 text,
  facility_custom_2 text,
  facility_custom_3 text,
  facility_custom_4 text,
  facility_custom_5 text
);

CREATE INDEX idx_facilities_admin_areas ON facilities(admin_area_4, admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX idx_facilities_admin_area_1 ON facilities(admin_area_1);
CREATE INDEX idx_facilities_admin_area_2 ON facilities(admin_area_2);
CREATE INDEX idx_facilities_admin_area_3 ON facilities(admin_area_3);
CREATE INDEX idx_facilities_admin_area_4 ON facilities(admin_area_4);

-- ============================================================================
-- MODULE SYSTEM
-- ============================================================================

CREATE TABLE modules (
  id text PRIMARY KEY NOT NULL,
  module_definition text NOT NULL,
  config_selections text NOT NULL,
  dirty text NOT NULL,
  compute_def_updated_at text,
  compute_def_git_ref text,
  presentation_def_updated_at text,
  presentation_def_git_ref text,
  config_updated_at text,
  last_run_at text NOT NULL,
  last_run_git_ref text
);

CREATE INDEX idx_modules_dirty ON modules(dirty);

-- ============================================================================
-- RESULTS OBJECTS AND METRICS
-- ============================================================================

-- Results object definitions extracted from module definitions
CREATE TABLE results_objects (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL,
  -- Store column definitions as JSON for now (can be further normalized later)
  column_definitions text,  -- JSON array of {colName, colType, notNull}
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX idx_results_objects_module_id ON results_objects(module_id);

-- Metrics extracted from module definitions
CREATE TABLE metrics (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL,
  label text NOT NULL,
  variant_label text,
  value_func text NOT NULL CHECK (value_func IN ('SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'identity')),
  format_as text NOT NULL CHECK (format_as IN ('percent', 'number')),
  value_props text NOT NULL,  -- JSON array of property names
  required_disaggregation_options text NOT NULL,  -- JSON array
  value_label_replacements text,  -- JSON object (nullable)
  post_aggregation_expression text,  -- JSON object (nullable)
  auto_include_facility_columns boolean DEFAULT false,
  results_object_id text NOT NULL,
  ai_description text,  -- JSON object (nullable)
  viz_presets text,  -- JSON array (nullable)
  hide boolean DEFAULT false,
  important_notes text,  -- resolved string (nullable)
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX idx_metrics_module_id ON metrics(module_id);

-- ============================================================================
-- VISUALIZATION AND PRESENTATION
-- ============================================================================

CREATE TABLE visualization_folders (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL
);

CREATE INDEX idx_visualization_folders_sort_order ON visualization_folders(sort_order);
CREATE INDEX idx_visualization_folders_last_updated ON visualization_folders(last_updated);

CREATE TABLE presentation_objects (
  id text PRIMARY KEY NOT NULL,
  metric_id text NOT NULL,  -- No FK - preserved across module uninstall/reinstall
  is_default_visualization boolean NOT NULL,
  label text NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL,
  created_by_ai boolean DEFAULT FALSE,
  folder_id TEXT REFERENCES visualization_folders(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX idx_presentation_objects_metric_id ON presentation_objects(metric_id);
CREATE INDEX idx_presentation_objects_last_updated ON presentation_objects(last_updated);
CREATE INDEX idx_presentation_objects_folder_id ON presentation_objects(folder_id);
CREATE INDEX idx_presentation_objects_sort_order ON presentation_objects(sort_order);

-- ============================================================================
-- SLIDE DECKS
-- ============================================================================

CREATE TABLE slide_deck_folders (
  id text PRIMARY KEY,
  label text NOT NULL,
  color text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  last_updated text NOT NULL
);

CREATE INDEX idx_slide_deck_folders_sort_order ON slide_deck_folders(sort_order);

CREATE TABLE slide_decks (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  plan text,
  config text,
  last_updated text NOT NULL,
  folder_id text REFERENCES slide_deck_folders(id) ON DELETE SET NULL
);

CREATE INDEX idx_slide_decks_last_updated ON slide_decks(last_updated);
CREATE INDEX idx_slide_decks_folder_id ON slide_decks(folder_id);

CREATE TABLE slides (
  id text PRIMARY KEY NOT NULL,
  slide_deck_id text NOT NULL,
  sort_order integer NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL,
  FOREIGN KEY (slide_deck_id) REFERENCES slide_decks(id) ON DELETE CASCADE
);

CREATE INDEX idx_slides_deck_id ON slides(slide_deck_id);
CREATE INDEX idx_slides_deck_sort ON slides(slide_deck_id, sort_order);
CREATE INDEX idx_slides_last_updated ON slides(last_updated);

-- ============================================================================
-- METADATA
-- ============================================================================

CREATE TABLE global_last_updated (
  id text PRIMARY KEY NOT NULL,
  last_updated text NOT NULL
);

CREATE INDEX idx_global_last_updated_last_updated ON global_last_updated(last_updated);

-- ============================================================================
-- SCHEMA MIGRATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id text PRIMARY KEY NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT NOW()
);