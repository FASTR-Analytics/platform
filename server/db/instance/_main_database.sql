-- ============================================================================
-- USER MANAGEMENT
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
  first_name text,
  last_name text,
  daily_token_usage integer NOT NULL DEFAULT 0,
  daily_token_usage_date date NOT NULL DEFAULT CURRENT_DATE,
  unlimited_ai boolean NOT NULL DEFAULT false,
  is_contact_person boolean NOT NULL DEFAULT false
);

-- Results runs catalog (PLAN_RESULTS_RUNS §2.6).
-- status: generating | ready | failed | retired. A referenced run is
-- undeletable via the products.run_id FK (no cascade). progress is the run
-- pipeline's worker-updated JSON (RunProgress), pushed over instance SSE.
CREATE TABLE runs (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'generating',
  provenance text NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by text,
  summary text,
  progress text,
  pinned boolean NOT NULL DEFAULT FALSE
);

-- At most one pinned package per instance (SYSTEM_08 "The pinned package + followers").
CREATE UNIQUE INDEX runs_one_pinned ON runs (pinned) WHERE pinned;

CREATE TABLE user_logs (
  id SERIAL PRIMARY KEY,
  user_email text NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint text NOT NULL,
  endpoint_result text NOT NULL,
  details text,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE TABLE ai_usage_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_email text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
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

CREATE INDEX idx_ai_usage_logs_timestamp ON ai_usage_logs(timestamp DESC);

CREATE TABLE user_logs_aggregate (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  endpoint_result TEXT NOT NULL,
  week_start DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_user_logs_aggregate_unique
ON user_logs_aggregate (user_email, endpoint, endpoint_result, week_start);

CREATE TABLE instance_config (
  config_key text PRIMARY KEY NOT NULL,
  config_json_value text NOT NULL
);

-- ============================================================================
-- PRODUCTS AND FOLDERS
-- ============================================================================

-- A product is a slide deck or a report. `products` is the registry every
-- cross-type operation goes through (list, folder move, delete, package
-- reattach, "in use by"); the per-type detail tables hang off it by the same
-- id. `last_updated` is THE product version — every content mutation and every
-- metadata write bumps it in the same transaction.

CREATE TABLE folders (
  id text PRIMARY KEY NOT NULL,        -- uuid
  label text NOT NULL,
  color text,
  last_updated text NOT NULL
);

CREATE TABLE products (
  id text PRIMARY KEY NOT NULL,        -- 4-char nanoid (legacy 3-char kept)
  type text NOT NULL CHECK (type IN ('slide_deck', 'report')),
  label text NOT NULL,
  folder_id text REFERENCES folders(id) ON DELETE SET NULL,
  run_id text NOT NULL REFERENCES runs(id),  -- no cascade: the delete-run guard
  admin_area_2 text,                   -- NULL = national
  created_by text,                     -- email; NULL = pre-restructure product
  created_at text,                     -- NULL = pre-restructure product
  last_updated text NOT NULL
);

CREATE INDEX idx_products_folder_id ON products(folder_id);
CREATE INDEX idx_products_run_id ON products(run_id);
CREATE INDEX idx_products_type ON products(type);
CREATE INDEX idx_products_last_updated ON products(last_updated);

CREATE TABLE slide_decks (
  id text PRIMARY KEY NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  plan text,
  config text
);

CREATE TABLE slides (
  id text PRIMARY KEY NOT NULL,        -- 4-char nanoid
  slide_deck_id text NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  config text NOT NULL,
  last_updated text NOT NULL,          -- per-slide optimistic lock + slide cache
  crdt_state text,
  crdt_state_last_updated text
);

CREATE INDEX idx_slides_deck_id ON slides(slide_deck_id);
CREATE INDEX idx_slides_deck_sort ON slides(slide_deck_id, sort_order);
CREATE INDEX idx_slides_last_updated ON slides(last_updated);

CREATE TABLE reports (
  id text PRIMARY KEY NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  figures text NOT NULL DEFAULT '{}',
  images text NOT NULL DEFAULT '{}',
  config text,
  crdt_state text,
  crdt_state_last_updated text,
  body_authors text
);

-- One row = one editing-session version: full content snapshot + the editors
-- who contributed during that window (JSON [{email, name}]). Deduped by
-- content_hash against the newest version; newest 100 kept per document.
CREATE TABLE report_versions (
  id text PRIMARY KEY NOT NULL,
  report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  label text NOT NULL,
  body text NOT NULL,
  figures text NOT NULL DEFAULT '{}',
  images text NOT NULL DEFAULT '{}',
  editors text NOT NULL DEFAULT '[]',
  content_hash text NOT NULL,
  restored_from_version_id text,
  body_authors text
);

CREATE INDEX idx_report_versions_report ON report_versions(report_id, created_at DESC);

CREATE TABLE deck_versions (
  id text PRIMARY KEY NOT NULL,
  deck_id text NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  label text NOT NULL,
  deck_config text NOT NULL,
  slides text NOT NULL,
  editors text NOT NULL DEFAULT '[]',
  content_hash text NOT NULL,
  restored_from_version_id text,
  slide_editors text
);

CREATE INDEX idx_deck_versions_deck ON deck_versions(deck_id, created_at DESC);

-- ============================================================================
-- ADMINISTRATIVE STRUCTURE
-- ============================================================================

-- Per-family admin-area trees: each facility registry (HMIS, HFA) has its own
-- four-level tree. Storage is always 4 levels — staging pads levels above the
-- family's configured depth with the leaf value — and every read gates on the
-- family's depth, which hides exactly the padding. Invariant: each tree level
-- mirrors the distinct level-N paths in that family's facilities table
-- (maintained by cleanupUnusedAdminAreas after every integrate/delete).

CREATE TABLE admin_areas_hmis_1 (
  admin_area_1 text PRIMARY KEY NOT NULL
);

CREATE TABLE admin_areas_hmis_2 (
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_1) REFERENCES admin_areas_hmis_1 (admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_admin_areas_hmis_2_admin_area_1 ON admin_areas_hmis_2(admin_area_1);
CREATE INDEX idx_admin_areas_hmis_2_admin_area_2 ON admin_areas_hmis_2(admin_area_2);

CREATE TABLE admin_areas_hmis_3 (
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_2, admin_area_1) REFERENCES admin_areas_hmis_2 (admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_admin_areas_hmis_3_admin_area_2_admin_area_1 ON admin_areas_hmis_3(admin_area_2, admin_area_1);
CREATE INDEX idx_admin_areas_hmis_3_admin_area_3 ON admin_areas_hmis_3(admin_area_3);
CREATE INDEX idx_admin_areas_hmis_3_admin_area_2 ON admin_areas_hmis_3(admin_area_2);

CREATE TABLE admin_areas_hmis_4 (
  admin_area_4 text NOT NULL,
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_hmis_3 (admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_admin_areas_hmis_4_admin_area_3_admin_area_2_admin_area_1 ON admin_areas_hmis_4(admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX idx_admin_areas_hmis_4_admin_area_4 ON admin_areas_hmis_4(admin_area_4);

CREATE TABLE admin_areas_hfa_1 (
  admin_area_1 text PRIMARY KEY NOT NULL
);

CREATE TABLE admin_areas_hfa_2 (
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_1) REFERENCES admin_areas_hfa_1 (admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_admin_areas_hfa_2_admin_area_1 ON admin_areas_hfa_2(admin_area_1);
CREATE INDEX idx_admin_areas_hfa_2_admin_area_2 ON admin_areas_hfa_2(admin_area_2);

CREATE TABLE admin_areas_hfa_3 (
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_2, admin_area_1) REFERENCES admin_areas_hfa_2 (admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_admin_areas_hfa_3_admin_area_2_admin_area_1 ON admin_areas_hfa_3(admin_area_2, admin_area_1);
CREATE INDEX idx_admin_areas_hfa_3_admin_area_3 ON admin_areas_hfa_3(admin_area_3);
CREATE INDEX idx_admin_areas_hfa_3_admin_area_2 ON admin_areas_hfa_3(admin_area_2);

CREATE TABLE admin_areas_hfa_4 (
  admin_area_4 text NOT NULL,
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_hfa_3 (admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX idx_admin_areas_hfa_4_admin_area_3_admin_area_2_admin_area_1 ON admin_areas_hfa_4(admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX idx_admin_areas_hfa_4_admin_area_4 ON admin_areas_hfa_4(admin_area_4);

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
  FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_hmis_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
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
  FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_hfa_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
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
  dataset_family text NOT NULL,  -- 'hmis' or 'hfa': one resumable import per registry
  date_started text NOT NULL,
  step integer NOT NULL,
  status text NOT NULL,  -- JSON: full status object
  status_type text NOT NULL,  -- Simple status: configuring, importing, complete, error
  source_type text,  -- csv or dhis2 (nullable until step 0 is completed)
  step_1_result text,  -- CSV details OR DHIS2 credentials
  step_2_result text,  -- Column mappings OR DHIS2 org unit selection
  step_3_result text,  -- Staging result (table name, counts, validation info)
  recodes text,  -- JSON: review-step value recodes (column → facility_id → new value)
  CONSTRAINT structure_upload_attempts_pkey PRIMARY KEY (dataset_family),
  CONSTRAINT structure_upload_attempts_family_check CHECK (dataset_family IN ('hmis', 'hfa'))
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
  -- NO ACTION (default), not RESTRICT (RESTRICT's delete-side check can't defer).
  -- replace_all now refuses (via assertNoBlockingReferencesForReplace) when a
  -- dataset still references these facilities, so the old deferred SET CONSTRAINTS
  -- delete is gone; the FK is left DEFERRABLE but its name is no longer used by code.
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

-- Import ledger: latest import state per (raw indicator, month). Written
-- inside every integration and deletion transaction, so it can never disagree
-- with dataset_hmis (see server/db/instance/dataset_hmis_import_ledger.ts).
CREATE TABLE dataset_hmis_import_ledger (
  indicator_raw_id text NOT NULL REFERENCES indicators_raw(indicator_raw_id) ON DELETE CASCADE,
  period_id integer NOT NULL,
  n_records integer NOT NULL,
  sum_count bigint NOT NULL,
  source text NOT NULL CHECK (source IN ('dhis2', 'csv', 'backfill')),
  status text NOT NULL CHECK (status IN ('ready', 'error')),
  error text,
  imported_at timestamptz,
  version_id integer REFERENCES dataset_hmis_versions(id),
  PRIMARY KEY (indicator_raw_id, period_id)
);

-- HMIS import runs: one row per import — DHIS2 (per-pair fetch+integrate) or
-- CSV (stage → conditional review gate → integrate). See
-- server/db/instance/dataset_hmis_import_runs.ts. Per-pair outcomes live
-- in dataset_hmis_import_ledger; run_stats holds per-run instrumentation
-- (DHIS2) or the CSV staging diagnostics. dhis2_url/selection are DHIS2-only;
-- csv_config ({ fileName, filePin, mappings } JSON) is CSV-only — the
-- pairing is enforced in code at the write boundary.
CREATE TABLE dataset_hmis_import_runs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger text NOT NULL CHECK (trigger IN ('manual', 'schedule')),
  triggered_by text,
  source text NOT NULL CHECK (source IN ('dhis2', 'csv')),
  dhis2_url text,
  selection text,
  csv_config text,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'needs_review', 'complete', 'error', 'cancelled')),
  error text,
  total_pairs integer NOT NULL DEFAULT 0,
  succeeded_pairs integer NOT NULL DEFAULT 0,
  failed_pairs integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  version_id integer REFERENCES dataset_hmis_versions(id),
  progress text,
  run_stats text
);

-- At most one run can be in flight: the INSERT of a 'running' row is the
-- atomic concurrency claim for launching a run.
CREATE UNIQUE INDEX idx_dataset_hmis_import_runs_single_running
  ON dataset_hmis_import_runs ((true)) WHERE status = 'running';

-- Stored instance DHIS2 credentials (PLAN_DHIS2_CREDENTIAL_STORE_
-- CONSOLIDATION Phase 1): single row, shared by every DHIS2 flow (structure,
-- indicators, geojson, HMIS data). Password encrypted at rest with a key
-- from the DHIS2_CREDENTIALS_ENCRYPTION_KEY env var (never in the DB);
-- decrypted server-side only at fetch time
-- (see server/db/instance/instance_dhis2_credentials.ts).
CREATE TABLE instance_dhis2_credentials (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  url text NOT NULL,
  username text NOT NULL,
  password_encrypted text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scheduled DHIS2 imports (PLAN_DHIS2_IMPORTER Phase 4, C4): one-shot +
-- recurring rows fired by the ~60 s scheduler tick
-- (see server/worker_routines/import_hmis_data_dhis2/scheduler.ts).
-- selection is a rolling window JSON ({ rawIndicatorIds, monthsBack })
-- resolved at fire time; last_fired_at is the last HANDLED occurrence — the
-- tick's compare-and-set idempotency token.
CREATE TABLE dataset_hmis_scheduled_imports (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('one_shot', 'recurring')),
  enabled boolean NOT NULL,
  selection text NOT NULL,
  run_at timestamptz,
  -- Recurring only: Dhis2ScheduleRecurrence JSON (daily / weekly / monthly).
  recurrence text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Stamped on create/enable/edit; occurrences before it are never due
  -- (no phantom first fire, no false 'missed' — review finding 1).
  armed_at timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz,
  last_outcome text CHECK (last_outcome IN ('launched', 'refused', 'missed')),
  last_error text,
  last_run_id integer REFERENCES dataset_hmis_import_runs(id) ON DELETE SET NULL
);

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
  sentinel_class TEXT NOT NULL DEFAULT '',
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
  -- NO ACTION (default), not RESTRICT (RESTRICT's delete-side check can't defer).
  -- replace_all now refuses (via assertNoBlockingReferencesForReplace) when a
  -- dataset still references these facilities, so the old deferred SET CONSTRAINTS
  -- delete is gone; the FK is left DEFERRABLE but its name is no longer used by code.
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
  -- Strictly positive: design weights are >= 1 for any surveyed facility, and
  -- a 0 silently excludes the facility from all weighted estimates
  weight double precision NOT NULL CHECK (weight > 0),
  PRIMARY KEY (facility_id, time_point),
  FOREIGN KEY (facility_id) REFERENCES facilities_hfa(facility_id) ON DELETE CASCADE,
  FOREIGN KEY (time_point) REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_hfa_facility_weights_time_point ON hfa_facility_weights(time_point);

-- ============================================================================
-- HFA IMPORT RUNS
-- ============================================================================

-- One row per HFA import (stage → conditional review gate → integrate). See
-- server/db/instance/dataset_hfa_import_runs.ts. No queue (manual-only, no
-- scheduler) and no version_id — HFA's outcome plane is the time point
-- (hfa_time_points.imported_at + the per-time-point data tables). csv_config
-- is the launch payload ({ csvFileName, csvFilePin, xlsFormFileName,
-- xlsFormFilePin, mappings } JSON); diagnostics is the staging result.
CREATE TABLE hfa_import_runs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  triggered_by text,
  csv_config text NOT NULL,
  time_point text NOT NULL,
  status text NOT NULL CHECK (status IN
    ('running', 'needs_review', 'complete', 'error', 'cancelled')),
  error text,
  progress text,
  diagnostics text,
  n_rows_integrated integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

-- The single-running claim: the INSERT (or the needs_review re-claim) is the
-- only arbiter of "at most one HFA import running, ever".
CREATE UNIQUE INDEX idx_hfa_import_runs_single_running
  ON hfa_import_runs ((true)) WHERE status = 'running';

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

CREATE TABLE hfa_indicator_service_categories (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- HFA INDICATOR VARIANT GROUPS
-- ============================================================================

CREATE TABLE hfa_indicator_variant_groups (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE hfa_indicator_variant_items (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL REFERENCES hfa_indicator_variant_groups(id) ON UPDATE CASCADE ON DELETE CASCADE,
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
  service_category_ids TEXT NOT NULL DEFAULT '[]',
  short_label TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('binary', 'numeric')),
  aggregation TEXT NOT NULL DEFAULT 'sum' CHECK (aggregation IN ('sum', 'avg')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  has_syntax_error BOOLEAN NOT NULL DEFAULT FALSE,
  code_consistent BOOLEAN NOT NULL DEFAULT TRUE,
  -- Deliberately ON DELETE RESTRICT (default NO ACTION): deleting a group that
  -- any indicator still references is refused.
  variant_group_id TEXT REFERENCES hfa_indicator_variant_groups(id) ON UPDATE CASCADE,
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

CREATE TABLE hfa_indicator_variant_code (
  var_name TEXT NOT NULL REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE RESTRICT,
  item_id TEXT NOT NULL REFERENCES hfa_indicator_variant_items(id) ON UPDATE CASCADE ON DELETE CASCADE,
  r_code TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (var_name, time_point, item_id)
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

-- Per-family boundary files: a map means "boundaries matching THIS registry's
-- naming at THIS level". Up to six rows (2 families x levels 2..4).
CREATE TABLE geojson_maps (
  facility_family text NOT NULL CHECK (facility_family IN ('hmis', 'hfa')),
  admin_area_level integer NOT NULL CHECK (admin_area_level IN (2, 3, 4)),
  geojson text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (facility_family, admin_area_level)
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

-- ============================================================================
-- ICEH IMPORT RUNS
-- ============================================================================

-- One row per ICEH import (in-memory stage → conditional review gate →
-- integrate). See server/db/instance/dataset_iceh_import_runs.ts. No queue
-- (manual-only, no scheduler) and no version_id — ICEH's outcome plane is the
-- cumulative iceh_indicators/iceh_data store; these run rows are ICEH's only
-- durable import history. zip_config is the launch payload
-- ({ zipFileName, zipFilePin } JSON); diagnostics is the staging result.
CREATE TABLE iceh_import_runs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  triggered_by text,
  zip_config text NOT NULL,
  status text NOT NULL CHECK (status IN
    ('running', 'needs_review', 'complete', 'error', 'cancelled')),
  error text,
  progress text,
  diagnostics text,
  n_rows_integrated integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

-- The single-running claim: the INSERT (or the needs_review re-claim) is the
-- only arbiter of "at most one ICEH import running, ever".
CREATE UNIQUE INDEX idx_iceh_import_runs_single_running
  ON iceh_import_runs ((true)) WHERE status = 'running';

-- ============================================================================
-- ASSET METADATA
-- ============================================================================

CREATE TABLE asset_metadata (
  file_name text PRIMARY KEY,
  uploader_email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- PERSONAL ACCESS TOKENS
-- ============================================================================
-- Server-minted per-user credentials for headless clients (MCP host, CLI).
-- Only the SHA-256 hash is stored; the token itself is shown once at mint.

CREATE TABLE personal_access_tokens (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_email text NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  label text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX idx_personal_access_tokens_user_email
  ON personal_access_tokens (user_email);

-- ============================================================================
-- SCHEMA MIGRATIONS
-- ============================================================================

CREATE TABLE schema_migrations (
  migration_id text PRIMARY KEY NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT NOW()
);
