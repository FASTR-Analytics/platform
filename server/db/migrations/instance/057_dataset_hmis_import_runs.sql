-- DHIS2 import runs (PLAN_DHIS2_IMPORTER Phase 3, C2): one row per run of the
-- per-pair fetch+integrate worker. Replaces the single-row attempt status blob
-- for DHIS2 imports; per-pair outcomes live in dataset_hmis_import_ledger.
-- run_stats holds the durable per-run instrumentation (classification summary,
-- pairFetchStats, shadow-verification results).

CREATE TABLE IF NOT EXISTS dataset_hmis_import_runs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trigger text NOT NULL CHECK (trigger IN ('manual', 'schedule')),
  triggered_by text,
  dhis2_url text NOT NULL,
  selection text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'complete', 'error', 'cancelled')),
  error text,
  total_pairs integer NOT NULL DEFAULT 0,
  succeeded_pairs integer NOT NULL DEFAULT 0,
  failed_pairs integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  version_id integer REFERENCES dataset_hmis_versions(id),
  shadow_passed boolean,
  progress text,
  run_stats text
);

-- At most one run can be in flight: the INSERT of a 'running' row is the
-- atomic concurrency claim for launching a run.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dataset_hmis_import_runs_single_running
  ON dataset_hmis_import_runs ((true)) WHERE status = 'running';
