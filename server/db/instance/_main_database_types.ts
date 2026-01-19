export type DBUser = {
  email: string;
  is_admin: boolean;
};

export type UserLog = {
  id: number;
  user_email: string;
  timestamp: Date;
  endpoint: string;
  endpoint_result: string;
  details?: string;
}

export type DBInstanceConfig = {
  config_key: string;
  config_json_value: string;
};

export type DBProject = {
  id: string;
  label: string;
  ai_context: string;
  is_locked: boolean;
};

export type DBProjectUserRole = {
  email: string;
  project_id: string;
  role: string;
};

// Structure

export type DBIndicator = {
  indicator_common_id: string;
  indicator_common_label: string;
  is_default: boolean;
  updated_at: string;
};

export type DBIndicatorRaw = {
  indicator_raw_id: string;
  indicator_raw_label: string;
  updated_at: string;
};

export type DBIndicatorMapping = {
  indicator_raw_id: string;
  indicator_common_id: string;
  updated_at: string;
};

// Upload attempts

export type DBStructureUploadAttempt = {
  date_started: string;
  step: number;
  status: string;
  status_type: string;
  source_type: "csv" | "dhis2" | null;
  step_1_result: string | null; // CSV details OR DHIS2 credentials
  step_2_result: string | null; // Column mappings OR DHIS2 org unit selection
  step_3_result: string | null; // Staging result
};

// Dataset versions in main

export type DBDatasetHmisVersion = {
  id: number;
  n_rows_total_imported: number;
  n_rows_inserted: number | null;
  n_rows_updated: number | null;
  staging_result: string | null;
};

export type DBDatasetHmisUploadAttempt = {
  date_started: string;
  step: number;
  status: string;
  status_type: string;
  source_type: "csv" | "dhis2" | null;
  // Step 1: CSV upload OR DHIS2 confirmation
  step_1_result: string | null;
  // Step 2: Mappings OR DHIS2 selection
  step_2_result: string | null;
  // Step 3: Staging result
  step_3_result: string | null;
};

export type DBDatasetHfaVersion = {
  id: number;
  n_rows_total_imported: number;
  n_rows_inserted: number | null;
  n_rows_updated: number | null;
  staging_result: string | null;
};

export type DBDatasetHfaUploadAttempt = {
  date_started: string;
  step: number;
  status: string;
  status_type: string;
  source_type: "csv";
  // Step 1: CSV upload OR DHIS2 confirmation
  step_1_result: string | null;
  // Step 2: Mappings OR DHIS2 selection
  step_2_result: string | null;
  // Step 3: Staging result
  step_3_result: string | null;
};

// Audit logging

export type DBAuditLog = {
  id: number;
  timestamp: Date;
  user_email: string;
  project_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  method: string | null;
  path: string | null;
  details: string | null;
  success: boolean;
  error_message: string | null;
  session_id: string | null;
};
