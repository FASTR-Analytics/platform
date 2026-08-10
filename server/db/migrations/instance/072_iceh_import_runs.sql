-- ICEH imports become runs (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase C): one
-- row per import in iceh_import_runs, replacing the singleton
-- iceh_upload_attempts wizard state. No versions table — ICEH's outcome plane
-- is the cumulative iceh_indicators/iceh_data store; these run rows are
-- ICEH's first-ever durable import history.

CREATE TABLE IF NOT EXISTS iceh_import_runs (
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_iceh_import_runs_single_running
  ON iceh_import_runs ((true)) WHERE status = 'running';

-- The attempt machinery dies. Attempt rows are transient wizard state; an
-- in-flight import at deploy time dies with the restart and is relaunched
-- through the new wizard. Migration 037 re-creates this table on a fresh DB
-- (037 stays unrewritten), so the unconditional drop here runs after it and
-- makes fresh-DB and deployed-DB schemas converge.
DROP TABLE IF EXISTS iceh_upload_attempts;
