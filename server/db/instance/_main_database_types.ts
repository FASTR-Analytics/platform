import { type ProductType } from "lib";

export type DBUser = {
  email: string;
  is_admin: boolean;
  first_name: string | null;
  last_name: string | null;
  can_configure_users: boolean;
  can_view_users: boolean;
  can_view_logs: boolean;
  can_configure_settings: boolean;
  can_configure_data: boolean;
  can_view_data: boolean;
  daily_token_usage: number;
  daily_token_usage_date: Date;
  unlimited_ai: boolean;
  is_contact_person: boolean;
};

export type UserLog = {
  id: number;
  user_email: string;
  timestamp: Date;
  endpoint: string;
  endpoint_result: string;
  details?: string;
};

export type AiUsageLog = {
  id: number;
  timestamp: Date;
  user_email: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type UserLogAggregate = {
  id: number;
  user_email: string;
  endpoint: string;
  endpoint_result: string;
  week_start: Date;
  count: number;
};

export type DBInstanceConfig = {
  config_key: string;
  config_json_value: string;
};

// Products and folders

export type DBFolder = {
  id: string;
  label: string;
  color: string | null;
  parent_id: string | null;
  last_updated: string;
};

export type DBProduct = {
  id: string;
  type: ProductType;
  label: string;
  folder_id: string | null;
  run_id: string;
  admin_area_2: string | null;
  created_by: string | null;
  created_at: string | null;
  last_updated: string;
};

export type DBSlide = {
  id: string;
  slide_deck_id: string;
  sort_order: number;
  config: string;
  last_updated: string;
};

export type DBReportVersion = {
  id: string;
  report_id: string;
  created_at: string;
  label: string;
  body: string;
  figures: string;
  images: string;
  editors: string;
  content_hash: string;
  restored_from_version_id: string | null;
  body_authors: string | null;
};

export type DBDeckVersion = {
  id: string;
  deck_id: string;
  created_at: string;
  label: string;
  deck_config: string;
  slides: string;
  editors: string;
  content_hash: string;
  restored_from_version_id: string | null;
  slide_editors: string | null;
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
  dataset_family: "hmis" | "hfa";
  source_type: "csv" | "dhis2" | null;
  step_1_result: string | null; // CSV details OR DHIS2 credentials
  step_2_result: string | null; // Column mappings OR DHIS2 org unit selection
  step_3_result: string | null; // Staging result
  recodes: string | null; // JSON: StructureRecodes
};

// DHIS2 import runs in main

export type DBDatasetHmisImportRun = {
  id: number;
  trigger: "manual" | "schedule";
  triggered_by: string | null;
  source: "dhis2" | "csv";
  dhis2_url: string | null;
  selection: string | null;
  csv_config: string | null;
  status:
    | "queued"
    | "running"
    | "needs_review"
    | "complete"
    | "error"
    | "cancelled";
  error: string | null;
  total_pairs: number;
  succeeded_pairs: number;
  failed_pairs: number;
  started_at: string | Date;
  ended_at: string | Date | null;
  version_id: number | null;
  progress: string | null;
  run_stats: string | null;
};

export type DBInstanceDhis2Credentials = {
  singleton: boolean;
  url: string;
  username: string;
  password_encrypted: string;
  updated_by: string;
  updated_at: string | Date;
};

export type DBDatasetHmisScheduledImport = {
  id: number;
  kind: "one_shot" | "recurring";
  enabled: boolean;
  selection: string;
  run_at: string | Date | null;
  recurrence: string | null;
  created_by: string;
  created_at: string | Date;
  armed_at: string | Date;
  last_fired_at: string | Date | null;
  last_outcome: "launched" | "refused" | "missed" | null;
  last_error: string | null;
  last_run_id: number | null;
};

// Dataset versions in main

export type DBDatasetHmisVersion = {
  id: number;
  n_rows_total_imported: number;
  n_rows_inserted: number | null;
  n_rows_updated: number | null;
  staging_result: string | null;
};

export type DBHfaImportRun = {
  id: number;
  triggered_by: string | null;
  csv_config: string;
  time_point: string;
  status: "running" | "needs_review" | "complete" | "error" | "cancelled";
  error: string | null;
  progress: string | null;
  diagnostics: string | null;
  n_rows_integrated: number | null;
  started_at: string | Date;
  ended_at: string | Date | null;
};

export type DBIcehImportRun = {
  id: number;
  triggered_by: string | null;
  zip_config: string;
  status: "running" | "needs_review" | "complete" | "error" | "cancelled";
  error: string | null;
  progress: string | null;
  diagnostics: string | null;
  n_rows_integrated: number | null;
  started_at: string | Date;
  ended_at: string | Date | null;
};
