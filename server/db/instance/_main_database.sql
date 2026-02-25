-- ============================================================================
-- USER AND PROJECT MANAGEMENT
-- ============================================================================

CREATE TABLE users (
  email text PRIMARY KEY NOT NULL,
  is_admin boolean NOT NULL,
  can_configure_users boolean NOT NULL DEFAULT FALSE,
  can_view_users boolean NOT NULL DEFAULT FALSE,
  can_view_logs boolean NOT NULL DEFAULT FALSE,
  can_configure_settings boolean NOT NULL DEFAULT FALSE,
  can_configure_assets boolean NOT NULL DEFAULT FALSE,
  can_configure_data boolean NOT NULL DEFAULT FALSE,
  can_view_data boolean NOT NULL DEFAULT FALSE,
  can_create_projects boolean NOT NULL DEFAULT FALSE
);

CREATE TABLE projects (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  ai_context text NOT NULL,
  is_locked boolean NOT NULL DEFAULT FALSE,
  status text NOT NULL DEFAULT 'ready'
);

CREATE TABLE user_logs (
  id SERIAL PRIMARY KEY,
  user_email text NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint text NOT NULL,
  endpoint_result text NOT NULL,
  details text,
  project_id text,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE instance_config (
  config_key text PRIMARY KEY NOT NULL,
  config_json_value text NOT NULL
);

CREATE TABLE project_user_roles (
  email text NOT NULL,
  project_id text NOT NULL,
  role text NOT NULL,
  can_configure_settings boolean NOT NULL DEFAULT FALSE,
  can_create_backups boolean NOT NULL DEFAULT FALSE,
  can_restore_backups boolean NOT NULL DEFAULT FALSE,
  can_configure_modules boolean NOT NULL DEFAULT FALSE,
  can_run_modules boolean NOT NULL DEFAULT FALSE,
  can_configure_users boolean NOT NULL DEFAULT FALSE,
  can_configure_visualizations boolean NOT NULL DEFAULT FALSE,
  can_view_visualizations boolean NOT NULL DEFAULT FALSE,
  can_configure_reports boolean NOT NULL DEFAULT FALSE,
  can_view_reports boolean NOT NULL DEFAULT FALSE,
  can_configure_slide_decks boolean NOT NULL DEFAULT FALSE,
  can_view_slide_decks boolean NOT NULL DEFAULT FALSE,
  can_configure_data boolean NOT NULL DEFAULT FALSE,
  can_view_data boolean NOT NULL DEFAULT FALSE,
  can_view_metrics boolean NOT NULL DEFAULT FALSE,
  can_view_logs boolean NOT NULL DEFAULT FALSE,
  PRIMARY KEY (email, project_id),
  FOREIGN KEY (email) REFERENCES users (email) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX idx_project_user_roles_email ON project_user_roles(email);
CREATE INDEX idx_project_user_roles_project_id ON project_user_roles(project_id);

-- ============================================================================
-- ADMINISTRATIVE STRUCTURE
-- ============================================================================

CREATE TABLE admin_areas_1 (
  admin_area_1 text PRIMARY KEY NOT NULL
);

CREATE TABLE admin_areas_2 (
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_1) REFERENCES admin_areas_1 (admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_admin_areas_2_admin_area_1 ON admin_areas_2(admin_area_1);
CREATE INDEX idx_admin_areas_2_admin_area_2 ON admin_areas_2(admin_area_2);

CREATE TABLE admin_areas_3 (
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_2, admin_area_1) REFERENCES admin_areas_2 (admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_admin_areas_3_admin_area_2_admin_area_1 ON admin_areas_3(admin_area_2, admin_area_1);
CREATE INDEX idx_admin_areas_3_admin_area_3 ON admin_areas_3(admin_area_3);
CREATE INDEX idx_admin_areas_3_admin_area_2 ON admin_areas_3(admin_area_2);

CREATE TABLE admin_areas_4 (
  admin_area_4 text NOT NULL,
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_3 (admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_admin_areas_4_admin_area_3_admin_area_2_admin_area_1 ON admin_areas_4(admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX idx_admin_areas_4_admin_area_4 ON admin_areas_4(admin_area_4);

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
  facility_custom_5 text,
  FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_facilities_admin_areas ON facilities(admin_area_4, admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX idx_facilities_admin_area_1 ON facilities(admin_area_1);
CREATE INDEX idx_facilities_admin_area_2 ON facilities(admin_area_2);
CREATE INDEX idx_facilities_admin_area_3 ON facilities(admin_area_3);
CREATE INDEX idx_facilities_admin_area_4 ON facilities(admin_area_4);
CREATE INDEX idx_facilities_facility_type ON facilities(facility_type) WHERE facility_type IS NOT NULL;
CREATE INDEX idx_facilities_facility_ownership ON facilities(facility_ownership) WHERE facility_ownership IS NOT NULL;

-- ============================================================================
-- INDICATORS
-- ============================================================================

CREATE TABLE indicators (
  indicator_common_id text PRIMARY KEY NOT NULL,
  indicator_common_label text NOT NULL,
  is_default boolean NOT NULL DEFAULT FALSE,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE indicators_raw (
  indicator_raw_id text PRIMARY KEY NOT NULL,
  indicator_raw_label text NOT NULL,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE indicator_mappings (
  indicator_raw_id text NOT NULL,
  indicator_common_id text NOT NULL,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (indicator_raw_id, indicator_common_id),
  FOREIGN KEY (indicator_raw_id) REFERENCES indicators_raw(indicator_raw_id) ON DELETE CASCADE,
  FOREIGN KEY (indicator_common_id) REFERENCES indicators(indicator_common_id) ON DELETE CASCADE
);

CREATE INDEX idx_indicator_mappings_common_id ON indicator_mappings(indicator_common_id);
CREATE INDEX idx_indicator_mappings_raw_id ON indicator_mappings(indicator_raw_id);
CREATE INDEX idx_indicator_mappings_updated_at ON indicator_mappings(updated_at DESC);
CREATE INDEX idx_indicator_mappings_raw_common ON indicator_mappings(indicator_raw_id, indicator_common_id);

-- ============================================================================
-- FACILITY AND AA UPLOAD AND IMPORT TRACKING
-- ============================================================================

CREATE TABLE structure_upload_attempts (
  id text PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started text NOT NULL,
  step integer NOT NULL,
  status text NOT NULL,  -- JSON: full status object  
  status_type text NOT NULL,  -- Simple status: configuring, importing, complete, error
  source_type text,  -- csv or dhis2 (nullable until step 0 is completed)
  step_1_result text,  -- CSV details OR DHIS2 credentials
  step_2_result text,  -- Column mappings OR DHIS2 org unit selection
  step_3_result text   -- Staging result (table name, counts, validation info)
);

-- ============================================================================
-- DATASET HMIS MANAGEMENT
-- ============================================================================

CREATE TABLE dataset_hmis_versions (
  id integer PRIMARY KEY NOT NULL,
  n_rows_total_imported integer NOT NULL,
  n_rows_inserted integer,
  n_rows_updated integer,
  staging_result text
);

CREATE TABLE dataset_hmis (
  facility_id text NOT NULL,
  indicator_raw_id text NOT NULL,
  period_id integer NOT NULL 
    CHECK (period_id >= 190001 AND period_id <= 205012 AND period_id % 100 BETWEEN 1 AND 12),
  count integer NOT NULL CHECK (count >= 0),
  version_id integer NOT NULL,
  PRIMARY KEY (facility_id, indicator_raw_id, period_id),
  FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE RESTRICT DEFERRABLE,
  FOREIGN KEY (indicator_raw_id) REFERENCES indicators_raw(indicator_raw_id) ON DELETE RESTRICT DEFERRABLE,
  FOREIGN KEY (version_id) REFERENCES dataset_hmis_versions(id) ON DELETE RESTRICT
);

CREATE INDEX idx_dataset_hmis_indicator_period ON dataset_hmis(indicator_raw_id, period_id);
CREATE INDEX idx_dataset_hmis_period_indicator ON dataset_hmis(period_id, indicator_raw_id);
CREATE INDEX idx_dataset_hmis_version_id ON dataset_hmis(version_id);
CREATE INDEX idx_dataset_hmis_facility_period ON dataset_hmis(facility_id, period_id);
CREATE INDEX idx_dataset_hmis_indicator_id ON dataset_hmis(indicator_raw_id);
CREATE INDEX idx_dataset_hmis_period_id ON dataset_hmis(period_id);

CREATE TABLE dataset_hmis_upload_attempts (
  id text PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started text NOT NULL,
  step integer NOT NULL,
  status text NOT NULL,
  status_type text NOT NULL,  -- Simple status: configuring, staging, staged, integrating, error
  source_type text,  -- csv or dhis2 (nullable until step 0 is completed)
  step_1_result text,  -- CSV upload OR DHIS2 confirmation
  step_2_result text,  -- Mappings OR DHIS2 selection
  step_3_result text   -- Staging result
);

-- Removed index on status column because it contains large JSON that can exceed btree index size limits
-- CREATE INDEX idx_dataset_hmis_upload_attempts_status ON dataset_hmis_upload_attempts(status);
CREATE INDEX idx_dataset_hmis_upload_attempts_status_type ON dataset_hmis_upload_attempts(status_type);
CREATE INDEX idx_dataset_hmis_upload_attempts_date_started ON dataset_hmis_upload_attempts(date_started);

-- ============================================================================
-- DATASET HMIS MANAGEMENT
-- ============================================================================

CREATE TABLE dataset_hfa_versions (
  id integer PRIMARY KEY NOT NULL,
  n_rows_total_imported integer NOT NULL,
  n_rows_inserted integer,
  n_rows_updated integer,
  staging_result text
);

CREATE TABLE dataset_hfa (
  facility_id text NOT NULL,
  time_point text NOT NULL,
  var_name text NOT NULL,
  value text NOT NULL,
  version_id integer NOT NULL,
  PRIMARY KEY (facility_id, time_point, var_name),
  FOREIGN KEY (facility_id) REFERENCES facilities(facility_id) ON DELETE RESTRICT DEFERRABLE,
  FOREIGN KEY (version_id) REFERENCES dataset_hfa_versions(id) ON DELETE RESTRICT
);

CREATE TABLE dataset_hfa_upload_attempts (
  id text PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started text NOT NULL,
  step integer NOT NULL,
  status text NOT NULL,
  status_type text NOT NULL,  -- Simple status: configuring, staging, staged, integrating, error
  source_type text NOT NULL,  
  step_1_result text,  
  step_2_result text,  
  step_3_result text  
);

-- Indexes for dataset_hfa
CREATE INDEX idx_dataset_hfa_var_name ON dataset_hfa(var_name);
CREATE INDEX idx_dataset_hfa_facility_id ON dataset_hfa(facility_id);
CREATE INDEX idx_dataset_hfa_version_id ON dataset_hfa(version_id);
CREATE INDEX idx_dataset_hfa_var_facility ON dataset_hfa(var_name, facility_id);
CREATE INDEX idx_dataset_hfa_value ON dataset_hfa(value) WHERE LENGTH(value) <= 50;
CREATE INDEX idx_dataset_hfa_covering ON dataset_hfa(var_name, facility_id, time_point) INCLUDE (value);

-- Indexes for dataset_hfa_upload_attempts
CREATE INDEX idx_dataset_hfa_upload_attempts_status ON dataset_hfa_upload_attempts(status);
CREATE INDEX idx_dataset_hfa_upload_attempts_status_type ON dataset_hfa_upload_attempts(status_type);
CREATE INDEX idx_dataset_hfa_upload_attempts_date_started ON dataset_hfa_upload_attempts(date_started);

-- ============================================================================
-- SCHEMA MIGRATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id text PRIMARY KEY NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT NOW()
);
