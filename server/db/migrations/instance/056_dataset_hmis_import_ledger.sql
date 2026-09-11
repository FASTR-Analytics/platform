-- Import ledger: latest import state per (raw indicator, month) for the HMIS
-- dataset (PLAN_DHIS2_IMPORTER WS-B). Written inside every integration and
-- deletion transaction, so it can never disagree with dataset_hmis.

CREATE TABLE IF NOT EXISTS dataset_hmis_import_ledger (
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

-- Backfill from existing data. imported_at NULL = pre-ledger history.
-- ON CONFLICT DO NOTHING keeps this idempotent and never overwrites rows the
-- integration writers have since maintained. Guarded on the pre-086 column
-- name: on a fresh install the ledger already exists (the CREATE above is
-- skipped before its FK is resolved) and dataset_hmis carries source_id, so
-- the backfill is a no-op there.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dataset_hmis' AND column_name = 'indicator_raw_id'
  ) THEN
    INSERT INTO dataset_hmis_import_ledger
      (indicator_raw_id, period_id, n_records, sum_count, source, status, imported_at, version_id)
    SELECT indicator_raw_id, period_id, COUNT(*)::integer, SUM(count)::bigint, 'backfill', 'ready', NULL, NULL
    FROM dataset_hmis
    GROUP BY indicator_raw_id, period_id
    ON CONFLICT (indicator_raw_id, period_id) DO NOTHING;
  END IF;
END $$;
