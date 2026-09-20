-- ============================================================================
-- USERS
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

-- At most one pinned package per instance (SYSTEM_08 "The pinned package").
CREATE UNIQUE INDEX runs_one_pinned ON runs (pinned) WHERE pinned;

-- Labels are unique per instance, case- and whitespace-insensitively (091).
CREATE UNIQUE INDEX runs_label_unique ON runs (lower(trim(label)));

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
-- id. `last_updated` is THE product version: every content mutation and every
-- metadata write bumps it in the same transaction. Folders nest through
-- `parent_id` (an adjacency list; no stored path, no depth cap, acyclic by
-- server enforcement). `created_by` and `created_at` are provenance, not
-- ownership; NULL on rows migration 201 consolidated. Each detail table
-- carries a fixed `type` and a composite FK on (id, type), so a row
-- can only exist in the detail table its registry type names; nothing
-- forces the detail row to exist, which is the one-transaction insert rule.

CREATE TABLE folders (
  id text PRIMARY KEY NOT NULL,        -- uuid
  label text NOT NULL,
  color text,
  parent_id text REFERENCES folders(id) ON DELETE SET NULL,  -- NULL = root
  created_by text,                     -- email
  created_at text,
  last_updated text NOT NULL
);

CREATE INDEX idx_folders_parent_id ON folders(parent_id);

CREATE TABLE products (
  id text PRIMARY KEY NOT NULL,        -- 4-char nanoid (legacy 3-char kept)
  type text NOT NULL CHECK (type IN ('slide_deck', 'report')),
  label text NOT NULL,
  folder_id text REFERENCES folders(id) ON DELETE SET NULL,
  run_id text NOT NULL REFERENCES runs(id),  -- no cascade: the delete-run guard
  admin_area_2 text,                   -- NULL = national
  created_by text,                     -- email
  created_at text,
  last_updated text NOT NULL,
  UNIQUE (id, type)                    -- target of the detail tables' composite FK
);

CREATE INDEX idx_products_folder_id ON products(folder_id);
CREATE INDEX idx_products_run_id ON products(run_id);
CREATE INDEX idx_products_type ON products(type);
CREATE INDEX idx_products_last_updated ON products(last_updated);

CREATE TABLE slide_decks (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL DEFAULT 'slide_deck' CHECK (type = 'slide_deck'),
  plan text,
  config text,
  FOREIGN KEY (id, type) REFERENCES products(id, type) ON DELETE CASCADE
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

CREATE INDEX idx_slides_slide_deck_id ON slides(slide_deck_id);
CREATE INDEX idx_slides_slide_deck_sort ON slides(slide_deck_id, sort_order);
CREATE INDEX idx_slides_last_updated ON slides(last_updated);

CREATE TABLE reports (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL DEFAULT 'report' CHECK (type = 'report'),
  body text NOT NULL DEFAULT '',
  figures text NOT NULL DEFAULT '{}',
  images text NOT NULL DEFAULT '{}',
  config text,
  crdt_state text,
  crdt_state_last_updated text,
  body_authors text,
  FOREIGN KEY (id, type) REFERENCES products(id, type) ON DELETE CASCADE
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

CREATE TABLE slide_deck_versions (
  id text PRIMARY KEY NOT NULL,
  slide_deck_id text NOT NULL REFERENCES slide_decks(id) ON DELETE CASCADE,
  created_at text NOT NULL,
  label text NOT NULL,
  slide_deck_config text NOT NULL,
  slides text NOT NULL,
  editors text NOT NULL DEFAULT '[]',
  content_hash text NOT NULL,
  restored_from_version_id text,
  slide_editors text
);

CREATE INDEX idx_slide_deck_versions_slide_deck ON slide_deck_versions(slide_deck_id, created_at DESC);

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

-- The dictionary (PLAN_A5 §2, PLAN_A6 §2). The data rows of dataset_hmis
-- are facts keyed by `data_id`; an indicator is a name and a type over
-- them, and nothing here moves a row. Four types: `uploaded` (an additive
-- monthly series filled by file; its rows carry its `data_id`, an opaque
-- key generated when the indicator is created, `u_` plus a UUID, never
-- typed and never matched against a file value: the CSV wizard maps each
-- file value onto an indicator), `dhis2_element` (a series the import
-- fetches; `data_id` is the data element UID or `UID.COC` operand,
-- DHIS2-shaped), `sum` (the members in indicator_sum_members, summed from
-- their rows at extract), `calculated` (`expression`, a formula over
-- indicators of any type and population terms, evaluated by m012 after
-- adjustment; a population type is named by its id, a reserved word, with
-- no FK). `has_rows` and `is_count` are generated: the two facts read off
-- the type, and the predicates lib restates as hasRows and isCount.
-- `include_in_analysis` off keeps an indicator dictionary-only: its data is
-- still stored, and it is still usable as a member or in a formula.
-- `thresholds` is a calculated indicator's own conditional-formatting rule as
-- JSON text (lib thresholdsRuleSchema), NULL when it has none and always
-- NULL on a count, which is also always formatted as a number. `dhis2_label`
-- is what DHIS2 calls a DHIS2 element's element or operand, read from live
-- metadata when the picker creates it and never edited; NULL on every other
-- type (the CHECK), on an element created by typing a UID, and on an
-- instance that ran migration 086 before the column existed. The indicator id
-- is renamable (ON UPDATE CASCADE follows it into the junction); the data
-- id is fixed once rows exist under it (the data FK has no update action).
-- A new database has an empty dictionary.
CREATE TABLE indicators (
  indicator_common_id text PRIMARY KEY NOT NULL,
  indicator_common_label text NOT NULL,
  definition_type text NOT NULL
    CONSTRAINT indicators_definition_type_check
    CHECK (definition_type IN ('uploaded', 'dhis2_element', 'sum', 'calculated')),
  data_id text CONSTRAINT indicators_data_id_key UNIQUE,
  dhis2_label text,
  expression text,
  include_in_analysis boolean NOT NULL DEFAULT TRUE,
  format_as text NOT NULL DEFAULT 'number'
    CONSTRAINT indicators_format_as_check
    CHECK (format_as IN ('percent', 'number', 'rate_per_10k')),
  thresholds text,  -- JSON: ThresholdsRule (nullable)
  direction text NOT NULL DEFAULT 'higher-is-better'
    CONSTRAINT indicators_direction_check
    CHECK (direction IN ('higher-is-better', 'lower-is-better')),
  target double precision,
  expected_low_counts boolean NOT NULL DEFAULT FALSE,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,

  has_rows boolean GENERATED ALWAYS AS
    (definition_type IN ('uploaded', 'dhis2_element')) STORED,
  is_count boolean GENERATED ALWAYS AS
    (definition_type IN ('uploaded', 'dhis2_element', 'sum')) STORED,

  CONSTRAINT indicators_fields_check CHECK (
    (definition_type = 'uploaded'      AND expression IS NULL AND data_id IS NOT NULL) OR
    (definition_type = 'dhis2_element' AND expression IS NULL AND data_id IS NOT NULL) OR
    (definition_type = 'sum'           AND expression IS NULL AND data_id IS NULL) OR
    (definition_type = 'calculated'    AND expression IS NOT NULL AND data_id IS NULL)
  ),
  CONSTRAINT indicators_element_shape_check CHECK (
    definition_type <> 'dhis2_element'
    OR data_id ~ '^[a-zA-Z][a-zA-Z0-9]{10}(\.[a-zA-Z][a-zA-Z0-9]{10})?$'
  ),
  CONSTRAINT indicators_dhis2_label_check CHECK (
    dhis2_label IS NULL OR definition_type = 'dhis2_element'
  ),
  CONSTRAINT indicators_count_format_check CHECK (NOT is_count OR format_as = 'number'),
  CONSTRAINT indicators_count_thresholds_check CHECK (NOT is_count OR thresholds IS NULL),
  CONSTRAINT indicators_count_target_check CHECK (NOT is_count OR target IS NULL),
  CONSTRAINT indicators_calculated_low_counts_check CHECK (is_count OR NOT expected_low_counts),
  -- Required by the composite FK in indicator_sum_members; redundant with the PK otherwise.
  CONSTRAINT indicators_common_id_has_rows_key UNIQUE (indicator_common_id, has_rows)
);

-- A sum's members: the FK can only reach an indicator with has_rows, so a
-- sum names Uploaded and DHIS2 element indicators and nothing else, and
-- retyping a member out of those is refused while a sum names it. Members
-- come back ordered by member id; there is no position column.
CREATE TABLE indicator_sum_members (
  sum_id text NOT NULL
    CONSTRAINT indicator_sum_members_sum_id_fkey
    REFERENCES indicators(indicator_common_id) ON DELETE CASCADE ON UPDATE CASCADE,
  member_id text NOT NULL,
  -- Always TRUE; exists so the FK can pin members to indicators with has_rows.
  member_has_rows boolean NOT NULL DEFAULT TRUE
    CONSTRAINT indicator_sum_members_member_has_rows_check CHECK (member_has_rows),
  CONSTRAINT indicator_sum_members_pkey PRIMARY KEY (sum_id, member_id),
  -- NO ACTION (the default), not RESTRICT: deleteIndicators removes a sum
  -- and its members in one statement, and RESTRICT checks each row before
  -- the sum's cascade has removed the junction row.
  CONSTRAINT indicator_sum_members_member_fkey
    FOREIGN KEY (member_id, member_has_rows)
    REFERENCES indicators(indicator_common_id, has_rows)
    ON UPDATE CASCADE
);

-- The population store (PLAN_1b ruling 1): annual figures per admin area ×
-- year × type, at the level the row was uploaded for. Names match the HMIS
-- structure tables (validated at upload, never FK'd — a structure re-import
-- must not silently delete population; a stale row is caught by the coverage
-- check at generation). Levels coarser than `admin_area_level` carry the
-- full path; finer columns carry ''.
CREATE TABLE population (
  population_type text NOT NULL,
  admin_area_level integer NOT NULL CHECK (admin_area_level IN (2, 3, 4)),
  admin_area_1 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_3 text NOT NULL DEFAULT '',
  admin_area_4 text NOT NULL DEFAULT '',
  year integer NOT NULL,
  count double precision NOT NULL CHECK (count >= 0),
  PRIMARY KEY (population_type, admin_area_level, admin_area_1, admin_area_2, admin_area_3, admin_area_4, year)
);

CREATE INDEX idx_population_type_level ON population(population_type, admin_area_level);

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
  data_id text NOT NULL,
  period_id integer NOT NULL 
    CHECK (period_id >= 190001 AND period_id <= 205012 AND period_id % 100 BETWEEN 1 AND 12),
  count integer NOT NULL CHECK (count >= 0),
  version_id integer NOT NULL,
  PRIMARY KEY (facility_id, data_id, period_id),
  -- NO ACTION (default), not RESTRICT (RESTRICT's delete-side check can't defer).
  -- Structure integration refuses (assertAbsentFacilitiesUnreferenced) before
  -- deleting any facility this table still references, so the old deferred
  -- SET CONSTRAINTS delete is gone; the FK is left DEFERRABLE but its name is
  -- no longer used by code.
  CONSTRAINT dataset_hmis_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities_hmis(facility_id) DEFERRABLE,
  -- Every data row is keyed by what DHIS2 or the file called its series
  -- (PLAN_A5 §2), which some indicator holds as its data id; deleting that
  -- indicator, or changing its data id while rows exist, is refused by the
  -- app's pre-check before this FK would. Named because instance migration
  -- 086 adds it under this name.
  CONSTRAINT dataset_hmis_data_id_fkey FOREIGN KEY (data_id) REFERENCES indicators(data_id) ON DELETE RESTRICT DEFERRABLE,
  FOREIGN KEY (version_id) REFERENCES dataset_hmis_versions(id) ON DELETE RESTRICT
);

CREATE INDEX idx_dataset_hmis_data_id_period ON dataset_hmis(data_id, period_id);
CREATE INDEX idx_dataset_hmis_period_data_id ON dataset_hmis(period_id, data_id);
CREATE INDEX idx_dataset_hmis_version_id ON dataset_hmis(version_id);
CREATE INDEX idx_dataset_hmis_facility_period ON dataset_hmis(facility_id, period_id);
CREATE INDEX idx_dataset_hmis_data_id ON dataset_hmis(data_id);
CREATE INDEX idx_dataset_hmis_period_id ON dataset_hmis(period_id);

-- Import ledger: latest import state per (data id, month). Written inside
-- every integration and deletion transaction, so it can never disagree with
-- dataset_hmis (see server/db/instance/dataset_hmis_import_ledger.ts).
-- skipped_values counts the DHIS2 facility values left out of the pair at its
-- last import as not non-negative integers; skipped_values_sample is a JSON
-- array of at most 10 { facilityId, value }.
CREATE TABLE dataset_hmis_import_ledger (
  data_id text NOT NULL,
  period_id integer NOT NULL,
  n_records integer NOT NULL,
  sum_count bigint NOT NULL,
  skipped_values integer NOT NULL DEFAULT 0,
  skipped_values_sample text NOT NULL DEFAULT '[]',
  route text NOT NULL CHECK (route IN ('dhis2', 'csv', 'backfill')),
  status text NOT NULL CHECK (status IN ('ready', 'error')),
  error text,
  imported_at timestamptz,
  version_id integer REFERENCES dataset_hmis_versions(id),
  PRIMARY KEY (data_id, period_id),
  CONSTRAINT dataset_hmis_import_ledger_data_id_fkey FOREIGN KEY (data_id) REFERENCES indicators(data_id) ON DELETE CASCADE
);

-- HMIS import runs: one row per import — DHIS2 (per-pair fetch+integrate) or
-- CSV (stage → conditional review gate → integrate). See
-- server/db/instance/dataset_hmis_import_runs.ts. Per-pair outcomes live
-- in dataset_hmis_import_ledger; run_stats holds per-run instrumentation
-- (DHIS2) or the CSV staging diagnostics. dhis2_url/selection are DHIS2-only;
-- csv_config ({ fileName, filePin, columns, mapping } JSON) is CSV-only — the
-- pairing is enforced in code at the write boundary.
CREATE TABLE dataset_hmis_import_runs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger text NOT NULL CHECK (trigger IN ('manual', 'schedule')),
  triggered_by text,
  route text NOT NULL CHECK (route IN ('dhis2', 'csv')),
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
-- selection is JSON over indicator ids (a rolling window { indicatorIds,
-- monthsBack } resolved at fire time, or an explicit range); last_fired_at is the last HANDLED occurrence — the
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
  variable_id TEXT NOT NULL,
  variable_label TEXT NOT NULL,
  variable_type TEXT NOT NULL,
  PRIMARY KEY (time_point, variable_id)
);

-- ============================================================================
-- HFA VARIABLE VALUES
-- ============================================================================

CREATE TABLE hfa_variable_values (
  time_point TEXT NOT NULL,
  variable_id TEXT NOT NULL,
  value TEXT NOT NULL,
  value_label TEXT NOT NULL,
  sentinel_class TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (time_point, variable_id, value),
  FOREIGN KEY (time_point, variable_id) REFERENCES hfa_variables(time_point, variable_id) ON UPDATE CASCADE ON DELETE CASCADE
);

-- ============================================================================
-- HFA DATA
-- ============================================================================

CREATE TABLE hfa_data (
  facility_id TEXT NOT NULL,
  time_point TEXT NOT NULL,
  variable_id TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (facility_id, time_point, variable_id),
  -- NO ACTION (default), not RESTRICT (RESTRICT's delete-side check can't defer).
  -- Structure integration refuses (assertAbsentFacilitiesUnreferenced) before
  -- deleting any facility this table still references, so the old deferred
  -- SET CONSTRAINTS delete is gone; the FK is left DEFERRABLE but its name is
  -- no longer used by code.
  CONSTRAINT hfa_data_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities_hfa(facility_id) DEFERRABLE,
  FOREIGN KEY (time_point) REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (time_point, variable_id) REFERENCES hfa_variables(time_point, variable_id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX idx_hfa_data_variable_id ON hfa_data(variable_id);
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
  indicator_id TEXT PRIMARY KEY NOT NULL,
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
  indicator_id TEXT NOT NULL REFERENCES hfa_indicators(indicator_id) ON DELETE CASCADE,
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE RESTRICT,
  r_code TEXT NOT NULL DEFAULT '',
  r_filter_code TEXT,
  PRIMARY KEY (indicator_id, time_point)
);

CREATE TABLE hfa_indicator_variant_code (
  indicator_id TEXT NOT NULL REFERENCES hfa_indicators(indicator_id) ON DELETE CASCADE,
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE RESTRICT,
  item_id TEXT NOT NULL REFERENCES hfa_indicator_variant_items(id) ON UPDATE CASCADE ON DELETE CASCADE,
  r_code TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (indicator_id, time_point, item_id)
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
