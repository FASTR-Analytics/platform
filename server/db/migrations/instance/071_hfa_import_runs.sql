-- HFA imports become runs (PLAN_DHIS2_IMPORTER_CONSOLIDATION Phase B): one row
-- per import in hfa_import_runs, replacing the singleton hfa_upload_attempts
-- wizard state. No queued status (manual-only, no scheduler) and no version_id
-- (HFA's outcome plane is the time point). The run row DURABLY keeps the
-- staging diagnostics that used to die with the deleted attempt row.

CREATE TABLE IF NOT EXISTS hfa_import_runs (
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_hfa_import_runs_single_running
  ON hfa_import_runs ((true)) WHERE status = 'running';

-- The attempt machinery dies. Attempt rows are transient wizard state; an
-- in-flight import at deploy time dies with the restart and is relaunched
-- through the new wizard. Migration 023 re-creates this table on a fresh DB
-- (023 stays unrewritten), so the unconditional drop here runs after it and
-- makes fresh-DB and deployed-DB schemas converge.
DROP TABLE IF EXISTS hfa_upload_attempts;
