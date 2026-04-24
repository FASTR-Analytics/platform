-- HFA Schema Redesign
-- - label as primary key (no UUID)
-- - period_id (YYYYMM) and sort_order
-- - Cleaner table naming (hfa_* prefix)
-- - ON UPDATE CASCADE for label renames

-- Drop all existing HFA tables
DROP TABLE IF EXISTS hfa_indicator_code CASCADE;
DROP TABLE IF EXISTS dataset_hfa CASCADE;
DROP TABLE IF EXISTS dataset_hfa_dictionary_values CASCADE;
DROP TABLE IF EXISTS dataset_hfa_dictionary_vars CASCADE;
DROP TABLE IF EXISTS dataset_hfa_dictionary_time_points CASCADE;
DROP TABLE IF EXISTS dataset_hfa_upload_attempts CASCADE;

-- Create hfa_time_points
CREATE TABLE IF NOT EXISTS hfa_time_points (
  label TEXT PRIMARY KEY,
  period_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  imported_at TIMESTAMPTZ
);

-- Create hfa_variables
CREATE TABLE IF NOT EXISTS hfa_variables (
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  var_name TEXT NOT NULL,
  var_label TEXT NOT NULL,
  var_type TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name)
);

-- Create hfa_variable_values
CREATE TABLE IF NOT EXISTS hfa_variable_values (
  time_point TEXT NOT NULL,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  value_label TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name, value),
  FOREIGN KEY (time_point, var_name) REFERENCES hfa_variables(time_point, var_name) ON UPDATE CASCADE ON DELETE CASCADE
);

-- Create hfa_data
CREATE TABLE IF NOT EXISTS hfa_data (
  facility_id TEXT NOT NULL REFERENCES facilities(facility_id),
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (facility_id, time_point, var_name),
  FOREIGN KEY (time_point, var_name) REFERENCES hfa_variables(time_point, var_name) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hfa_data_var_name ON hfa_data(var_name);
CREATE INDEX IF NOT EXISTS idx_hfa_data_facility_id ON hfa_data(facility_id);
CREATE INDEX IF NOT EXISTS idx_hfa_data_time_point ON hfa_data(time_point);

-- Create hfa_indicator_code (hfa_indicators already exists, unchanged)
CREATE TABLE IF NOT EXISTS hfa_indicator_code (
  var_name TEXT NOT NULL REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE RESTRICT,
  r_code TEXT NOT NULL DEFAULT '',
  r_filter_code TEXT,
  PRIMARY KEY (var_name, time_point)
);

-- Create hfa_upload_attempts
CREATE TABLE IF NOT EXISTS hfa_upload_attempts (
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
