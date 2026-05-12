-- These tables were replaced by hfa_* tables in migration 023_hfa_schema_redesign.sql
-- Keeping CREATE statements as no-ops (IF NOT EXISTS) for existing deployments
-- that already have them, but they'll be dropped by 023 anyway.

CREATE TABLE IF NOT EXISTS dataset_hfa_dictionary_time_points (
  time_point text NOT NULL PRIMARY KEY,
  time_point_label text NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_hfa_dictionary_vars (
  time_point text NOT NULL,
  var_name text NOT NULL,
  var_label text NOT NULL,
  PRIMARY KEY (time_point, var_name)
);

CREATE TABLE IF NOT EXISTS dataset_hfa_dictionary_values (
  time_point text NOT NULL,
  var_name text NOT NULL,
  value text NOT NULL,
  value_label text NOT NULL,
  PRIMARY KEY (time_point, var_name, value),
  FOREIGN KEY (time_point, var_name) REFERENCES dataset_hfa_dictionary_vars(time_point, var_name) ON DELETE CASCADE
);

-- Removed: DELETE and ALTER statements that referenced dataset_hfa/dataset_hfa_upload_attempts
-- Those tables were dropped in migration 023_hfa_schema_redesign.sql
