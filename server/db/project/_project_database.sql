-- ============================================================================
-- DATASET MANAGEMENT
-- ============================================================================

CREATE TABLE datasets (
  dataset_type text PRIMARY KEY NOT NULL,
  info text NOT NULL,
  last_updated text NOT NULL
);

CREATE TABLE project_logs (
  id SERIAL PRIMARY KEY,
  user_email text NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint text NOT NULL,
  endpoint_result text NOT NULL,
  project_id text NOT NULL,
  FOREIGN KEY (user_email) REFERENCES users(email)
);

CREATE TABLE indicators (
  indicator_common_id text PRIMARY KEY NOT NULL,
  indicator_common_label text NOT NULL
);

CREATE TABLE indicators_hfa (
  var_name text PRIMARY KEY NOT NULL,
  example_values text NOT NULL
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
  date_installed text NOT NULL,
  config_type text NOT NULL,
  config_selections text NOT NULL,
  last_updated text NOT NULL,
  last_run text NOT NULL,
  dirty text NOT NULL,
  latest_ran_commit_sha text
);

CREATE INDEX idx_modules_last_updated ON modules(last_updated);
CREATE INDEX idx_modules_last_run ON modules(last_run);
CREATE INDEX idx_modules_dirty ON modules(dirty);

-- ============================================================================
-- RESULTS OBJECTS AND VALUES (NORMALIZED FROM MODULE DEFINITIONS)
-- ============================================================================

-- Results object definitions extracted from module definitions
CREATE TABLE results_objects (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL,
  description text NOT NULL,
  -- Store column definitions as JSON for now (can be further normalized later)
  column_definitions text,  -- JSON array of {colName, colType, notNull}
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX idx_results_objects_module_id ON results_objects(module_id);

-- Results value definitions extracted from module definitions
CREATE TABLE results_values (
  id text PRIMARY KEY NOT NULL,
  results_object_id text NOT NULL,
  module_id text NOT NULL,
  label text NOT NULL,
  value_func text NOT NULL CHECK (value_func IN ('SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'identity')),
  format_as text NOT NULL CHECK (format_as IN ('percent', 'number')),
  -- Store complex fields as JSON
  value_props text NOT NULL,  -- JSON array of property names
  period_options text NOT NULL,  -- JSON array of period options
  disaggregation_options text NOT NULL,  -- JSON array with full disaggregation config
  value_label_replacements text,  -- JSON object (nullable)
  post_aggregation_expression text,  -- JSON object (nullable)
  auto_include_facility_columns boolean DEFAULT false,
  FOREIGN KEY (results_object_id) REFERENCES results_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX idx_results_values_results_object_id ON results_values(results_object_id);
CREATE INDEX idx_results_values_module_id ON results_values(module_id);

-- ============================================================================
-- VISUALIZATION AND PRESENTATION
-- ============================================================================

CREATE TABLE presentation_objects (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL,  -- Purposefully not a foreign key
  results_object_id text NOT NULL,
  results_value text NOT NULL,
  is_default_visualization boolean NOT NULL,
  label text NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL
);

CREATE INDEX idx_presentation_objects_module_id ON presentation_objects(module_id);
CREATE INDEX idx_presentation_objects_results_object_id ON presentation_objects(results_object_id);
CREATE INDEX idx_presentation_objects_last_updated ON presentation_objects(last_updated);

-- ============================================================================
-- REPORTING
-- ============================================================================

CREATE TABLE reports (
  id text PRIMARY KEY NOT NULL,
  report_type text NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL,
  is_deleted boolean NOT NULL
);

CREATE INDEX idx_reports_report_type ON reports(report_type);
CREATE INDEX idx_reports_is_deleted ON reports(is_deleted);
CREATE INDEX idx_reports_last_updated ON reports(last_updated);

CREATE TABLE report_items (
  id text PRIMARY KEY NOT NULL,
  report_id text NOT NULL,
  sort_order integer NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX idx_report_items_report_id ON report_items(report_id);
CREATE INDEX idx_report_items_sort_order ON report_items(report_id, sort_order);
CREATE INDEX idx_report_items_last_updated ON report_items(last_updated);

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