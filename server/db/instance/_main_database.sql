-- ============================================================================
-- USER AND PROJECT MANAGEMENT
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;


CREATE TABLE users (
  email text PRIMARY KEY NOT NULL,
  is_admin boolean NOT NULL,
  can_configure_users boolean NOT NULL DEFAULT FALSE,
  can_view_users boolean NOT NULL DEFAULT FALSE,
  can_view_logs boolean NOT NULL DEFAULT FALSE,
  can_configure_settings boolean NOT NULL DEFAULT FALSE,
  can_configure_data boolean NOT NULL DEFAULT FALSE,
  can_view_data boolean NOT NULL DEFAULT FALSE,
  can_create_projects boolean NOT NULL DEFAULT FALSE,
  first_name text,
  last_name text,
  default_project_can_configure_settings boolean NOT NULL DEFAULT FALSE,
  default_project_can_create_backups boolean NOT NULL DEFAULT FALSE,
  default_project_can_restore_backups boolean NOT NULL DEFAULT FALSE,
  default_project_can_configure_modules boolean NOT NULL DEFAULT FALSE,
  default_project_can_run_modules boolean NOT NULL DEFAULT FALSE,
  default_project_can_configure_users boolean NOT NULL DEFAULT FALSE,
  default_project_can_configure_visualizations boolean NOT NULL DEFAULT FALSE,
  default_project_can_view_visualizations boolean NOT NULL DEFAULT FALSE,
  default_project_can_configure_reports boolean NOT NULL DEFAULT FALSE,
  default_project_can_view_reports boolean NOT NULL DEFAULT FALSE,
  default_project_can_configure_slide_decks boolean NOT NULL DEFAULT FALSE,
  default_project_can_view_slide_decks boolean NOT NULL DEFAULT FALSE,
  default_project_can_configure_data boolean NOT NULL DEFAULT FALSE,
  default_project_can_view_data boolean NOT NULL DEFAULT FALSE,
  default_project_can_view_metrics boolean NOT NULL DEFAULT FALSE,
  default_project_can_view_logs boolean NOT NULL DEFAULT FALSE,
  default_project_can_view_script_code boolean NOT NULL DEFAULT FALSE,
  daily_token_usage integer NOT NULL DEFAULT 0,
  daily_token_usage_date date NOT NULL DEFAULT CURRENT_DATE,
  unlimited_ai boolean NOT NULL DEFAULT false,
  is_contact_person boolean NOT NULL DEFAULT false
);

CREATE TABLE projects (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  ai_context text NOT NULL,
  is_locked boolean NOT NULL DEFAULT FALSE,
  is_central_reporting boolean NOT NULL DEFAULT FALSE,
  status text NOT NULL DEFAULT 'ready',
  deletion_scheduled_at TIMESTAMPTZ
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

CREATE INDEX idx_user_logs_project_id ON user_logs(project_id) WHERE project_id IS NOT NULL;

CREATE TABLE ai_usage_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_email text NOT NULL,
  project_id text,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_usage_logs_user_email ON ai_usage_logs(user_email);

CREATE TABLE instance_weekly_token_usage (
  week_start date PRIMARY KEY,
  total_tokens integer NOT NULL DEFAULT 0
);

CREATE TABLE ai_limit_hits (
  user_email text NOT NULL,
  limit_type text NOT NULL CHECK (limit_type IN ('daily_user', 'weekly_instance')),
  hit_date date NOT NULL,
  PRIMARY KEY (user_email, limit_type, hit_date)
);

CREATE INDEX idx_ai_usage_logs_project_id ON ai_usage_logs(project_id);
CREATE INDEX idx_ai_usage_logs_timestamp ON ai_usage_logs(timestamp DESC);

CREATE TABLE user_logs_aggregate (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_result TEXT NOT NULL,
  project_id TEXT,
  week_start DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_user_logs_aggregate_unique
ON user_logs_aggregate (user_email, endpoint, endpoint_result, COALESCE(project_id, ''), week_start);

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
  can_view_script_code boolean NOT NULL DEFAULT FALSE,
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

CREATE TABLE facilities_hmis (
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

CREATE INDEX idx_facilities_hmis_admin_areas ON facilities_hmis(admin_area_4, admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX idx_facilities_hmis_admin_area_1 ON facilities_hmis(admin_area_1);
CREATE INDEX idx_facilities_hmis_admin_area_2 ON facilities_hmis(admin_area_2);
CREATE INDEX idx_facilities_hmis_admin_area_3 ON facilities_hmis(admin_area_3);
CREATE INDEX idx_facilities_hmis_admin_area_4 ON facilities_hmis(admin_area_4);
CREATE INDEX idx_facilities_hmis_facility_type ON facilities_hmis(facility_type) WHERE facility_type IS NOT NULL;
CREATE INDEX idx_facilities_hmis_facility_ownership ON facilities_hmis(facility_ownership) WHERE facility_ownership IS NOT NULL;

CREATE TABLE facilities_hfa (
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

CREATE INDEX idx_facilities_hfa_admin_areas ON facilities_hfa(admin_area_4, admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX idx_facilities_hfa_admin_area_1 ON facilities_hfa(admin_area_1);
CREATE INDEX idx_facilities_hfa_admin_area_2 ON facilities_hfa(admin_area_2);
CREATE INDEX idx_facilities_hfa_admin_area_3 ON facilities_hfa(admin_area_3);
CREATE INDEX idx_facilities_hfa_admin_area_4 ON facilities_hfa(admin_area_4);
CREATE INDEX idx_facilities_hfa_facility_type ON facilities_hfa(facility_type) WHERE facility_type IS NOT NULL;
CREATE INDEX idx_facilities_hfa_facility_ownership ON facilities_hfa(facility_ownership) WHERE facility_ownership IS NOT NULL;

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
  dataset_family text NOT NULL,  -- 'hmis' or 'hfa': which facility registry this import targets
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
  -- NO ACTION (default), not RESTRICT: RESTRICT's delete-side check can never be
  -- deferred, and the replace-all facility import relies on deferral. Constraint
  -- name is load-bearing: SET CONSTRAINTS in integrate_structure_from_staging.ts
  CONSTRAINT dataset_hmis_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities_hmis(facility_id) DEFERRABLE,
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
-- HFA TIME POINTS
-- ============================================================================

CREATE TABLE hfa_time_points (
  label TEXT PRIMARY KEY,
  period_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  imported_at TIMESTAMPTZ
);

-- ============================================================================
-- HFA VARIABLES
-- ============================================================================

CREATE TABLE hfa_variables (
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  var_name TEXT NOT NULL,
  var_label TEXT NOT NULL,
  var_type TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name)
);

-- ============================================================================
-- HFA VARIABLE VALUES
-- ============================================================================

CREATE TABLE hfa_variable_values (
  time_point TEXT NOT NULL,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  value_label TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name, value),
  FOREIGN KEY (time_point, var_name) REFERENCES hfa_variables(time_point, var_name) ON UPDATE CASCADE ON DELETE CASCADE
);

-- ============================================================================
-- HFA DATA
-- ============================================================================

CREATE TABLE hfa_data (
  facility_id TEXT NOT NULL,
  time_point TEXT NOT NULL,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (facility_id, time_point, var_name),
  -- NO ACTION (default), not RESTRICT: RESTRICT's delete-side check can never be
  -- deferred, and the replace-all facility import relies on deferral. Constraint
  -- name is load-bearing: SET CONSTRAINTS in integrate_structure_from_staging.ts
  CONSTRAINT hfa_data_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities_hfa(facility_id) DEFERRABLE,
  FOREIGN KEY (time_point) REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (time_point, var_name) REFERENCES hfa_variables(time_point, var_name) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_hfa_data_var_name ON hfa_data(var_name);
CREATE INDEX idx_hfa_data_facility_id ON hfa_data(facility_id);
CREATE INDEX idx_hfa_data_time_point ON hfa_data(time_point);

-- ============================================================================
-- HFA FACILITY SAMPLING WEIGHTS (per facility per time point)
-- ============================================================================

CREATE TABLE hfa_facility_weights (
  facility_id text NOT NULL,
  time_point text NOT NULL,
  weight double precision NOT NULL CHECK (weight >= 0),
  PRIMARY KEY (facility_id, time_point),
  FOREIGN KEY (facility_id) REFERENCES facilities_hfa(facility_id) ON DELETE CASCADE,
  FOREIGN KEY (time_point) REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_hfa_facility_weights_time_point ON hfa_facility_weights(time_point);

-- ============================================================================
-- HFA UPLOAD ATTEMPTS
-- ============================================================================

CREATE TABLE hfa_upload_attempts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started TEXT NOT NULL,
  step INTEGER NOT NULL,
  status TEXT NOT NULL,
  status_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  step_1_result TEXT,
  step_2_result TEXT,
  step_3_result TEXT
);

-- ============================================================================
-- HFA INDICATOR CATEGORIES
-- ============================================================================

CREATE TABLE hfa_indicator_categories (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE hfa_indicator_sub_categories (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL REFERENCES hfa_indicator_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- HFA INDICATORS
-- ============================================================================

CREATE TABLE hfa_indicators (
  var_name TEXT PRIMARY KEY NOT NULL,
  category_id TEXT REFERENCES hfa_indicator_categories(id) ON DELETE SET NULL,
  sub_category_id TEXT REFERENCES hfa_indicator_sub_categories(id) ON DELETE SET NULL,
  short_label TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('binary', 'numeric')),
  aggregation TEXT NOT NULL DEFAULT 'sum' CHECK (aggregation IN ('sum', 'avg')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  has_syntax_error BOOLEAN NOT NULL DEFAULT FALSE,
  code_consistent BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT hfa_indicators_sub_category_requires_category CHECK ((sub_category_id IS NULL) OR (category_id IS NOT NULL))
);

-- ============================================================================
-- HFA INDICATOR CODE
-- ============================================================================

CREATE TABLE hfa_indicator_code (
  var_name TEXT NOT NULL REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE RESTRICT,
  r_code TEXT NOT NULL DEFAULT '',
  r_filter_code TEXT,
  PRIMARY KEY (var_name, time_point)
);

-- ============================================================================
-- CALCULATED INDICATORS
-- ============================================================================

CREATE TABLE calculated_indicators (
  calculated_indicator_id     TEXT PRIMARY KEY NOT NULL,
  label                      TEXT NOT NULL UNIQUE,
  group_label                TEXT NOT NULL DEFAULT '',
  sort_order                 INTEGER NOT NULL DEFAULT 0,

  num_indicator_id           TEXT NOT NULL,
  denom_kind                 TEXT NOT NULL,
  denom_indicator_id         TEXT,
  denom_population_type      TEXT,
  denom_population_multiplier REAL,

  format_as                  TEXT NOT NULL DEFAULT 'percent' CHECK (format_as IN ('percent', 'number', 'rate_per_10k')),
  decimal_places             INTEGER NOT NULL DEFAULT 0,

  threshold_direction        TEXT NOT NULL DEFAULT 'higher_is_better' CHECK (threshold_direction IN ('higher_is_better', 'lower_is_better')),
  threshold_green            REAL NOT NULL,
  threshold_yellow           REAL NOT NULL,

  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT calculated_indicators_check CHECK (denom_kind IN ('none', 'indicator', 'population')),

  CONSTRAINT calculated_indicators_denom_fields_check CHECK (
    (denom_kind = 'none'
       AND denom_indicator_id IS NULL
       AND denom_population_type IS NULL
       AND denom_population_multiplier IS NULL)
    OR
    (denom_kind = 'indicator'
       AND denom_indicator_id IS NOT NULL
       AND denom_population_type IS NULL
       AND denom_population_multiplier IS NULL)
    OR
    (denom_kind = 'population'
       AND denom_indicator_id IS NULL
       AND denom_population_type IS NOT NULL
       AND denom_population_multiplier IS NOT NULL)
  ),

  FOREIGN KEY (num_indicator_id) REFERENCES indicators(indicator_common_id) ON DELETE RESTRICT,
  FOREIGN KEY (denom_indicator_id) REFERENCES indicators(indicator_common_id) ON DELETE RESTRICT
);

-- ============================================================================
-- GEOJSON MAPS
-- ============================================================================

CREATE TABLE geojson_maps (
  admin_area_level integer PRIMARY KEY CHECK (admin_area_level IN (2, 3, 4)),
  geojson text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- CUSTOM PROMPTS
-- ============================================================================

CREATE TABLE custom_prompts (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  content text NOT NULL,
  category text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('user', 'country')),
  created_by text NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (created_by) REFERENCES users(email) ON DELETE CASCADE
);
CREATE INDEX idx_custom_prompts_created_by ON custom_prompts(created_by);
CREATE INDEX idx_custom_prompts_scope ON custom_prompts(scope);

-- ============================================================================
-- DASHBOARD SLUGS
-- ============================================================================

-- Global registry mapping a public dashboard slug to its (project, dashboard).
-- Dashboards live in per-project databases and their id is only unique within a
-- project, so the slug (globally unique) is what lets the public route resolve a
-- bare /d/:slug URL to the right project DB without a projectId in the path.
CREATE TABLE dashboard_slugs (
  slug text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  dashboard_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE (project_id, dashboard_id)
);
CREATE INDEX idx_dashboard_slugs_project ON dashboard_slugs(project_id);

-- ============================================================================
-- ICEH DATA
-- ============================================================================

CREATE TABLE iceh_indicators (
  iceh_indicator TEXT PRIMARY KEY,
  indicator_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  numerator TEXT NOT NULL DEFAULT '',
  denominator TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE iceh_data (
  iceh_indicator TEXT NOT NULL REFERENCES iceh_indicators(iceh_indicator) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  source TEXT NOT NULL,
  strat TEXT NOT NULL CHECK (strat IN (
    'national', 'area', 'wealth_quintiles', 'wealth_deciles',
    'womans_education', 'womans_education_4_groups',
    'womans_age_current', 'womans_age_at_birth', 'sex', 'subnational_unit'
  )),
  level TEXT NOT NULL,
  estimate REAL,
  standard_error REAL,
  sample_size INTEGER,
  PRIMARY KEY (iceh_indicator, year, source, strat, level)
);

CREATE INDEX idx_iceh_data_indicator ON iceh_data(iceh_indicator);
CREATE INDEX idx_iceh_data_year ON iceh_data(year);
CREATE INDEX idx_iceh_data_strat ON iceh_data(strat);

CREATE TABLE iceh_upload_attempts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT 'single_row' CHECK (id = 'single_row'),
  date_started TEXT NOT NULL,
  step INTEGER NOT NULL,
  status TEXT NOT NULL,
  status_type TEXT NOT NULL,
  step_1_result TEXT,
  step_2_result TEXT,
  step_3_result TEXT
);

-- ============================================================================
-- ASSET METADATA
-- ============================================================================

CREATE TABLE asset_metadata (
  file_name text PRIMARY KEY,
  uploader_email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- SCHEMA MIGRATIONS
-- ============================================================================

CREATE TABLE schema_migrations (
  migration_id text PRIMARY KEY NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT NOW()
);
