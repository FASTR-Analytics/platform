-- DHIS2 auto-pull (PLAN_DHIS2_IMPORTER Phase 4 — C3/C4/C6):
-- 1. Stored instance DHIS2 credentials, password encrypted at rest (C3).
-- 2. Scheduled imports — one-shot + recurring rows the ~60 s scheduler tick
--    fires (C4).
-- 3. 'queued' run status — queued rows wait behind the running run / CSV
--    phase and are drained FIFO by the tick (C6).

-- C3: single-row stored credentials. password_encrypted =
-- base64(IV || AES-256-GCM ciphertext), key derived from the
-- DHIS2_CREDENTIALS_ENCRYPTION_KEY env var — the key never enters the DB and
-- decryption happens only in the run worker at fetch time
-- (see server/db/instance/dataset_hmis_dhis2_credentials.ts).
CREATE TABLE IF NOT EXISTS dataset_hmis_dhis2_credentials (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  url text NOT NULL,
  username text NOT NULL,
  password_encrypted text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- C4: scheduled imports. selection is a rolling window JSON
-- ({ rawIndicatorIds, monthsBack }) resolved to a concrete period window at
-- fire time. last_fired_at is the last HANDLED occurrence (launched, refused,
-- or missed) — the scheduler's compare-and-set idempotency token.
CREATE TABLE IF NOT EXISTS dataset_hmis_scheduled_imports (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('one_shot', 'recurring')),
  enabled boolean NOT NULL,
  selection text NOT NULL,
  run_at timestamptz,
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6),
  start_time text,
  timezone text,
  interval_weeks integer CHECK (interval_weeks >= 1),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_fired_at timestamptz,
  last_outcome text CHECK (last_outcome IN ('launched', 'refused', 'missed')),
  last_error text,
  last_run_id integer REFERENCES dataset_hmis_import_runs(id) ON DELETE SET NULL
);

-- C6: allow 'queued' run rows. Drop-and-re-add is idempotent (same end state
-- on every run); the constraint name is the Postgres default for the inline
-- CHECK in migration 057 / the base schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dataset_hmis_import_runs_status_check'
  ) THEN
    ALTER TABLE dataset_hmis_import_runs
      DROP CONSTRAINT dataset_hmis_import_runs_status_check;
  END IF;
  ALTER TABLE dataset_hmis_import_runs
    ADD CONSTRAINT dataset_hmis_import_runs_status_check
    CHECK (status IN ('queued', 'running', 'complete', 'error', 'cancelled'));
END $$;
