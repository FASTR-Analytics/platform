-- The HFA indicator verification run, which a server worker drains, at most
-- one live per instance: the latest run, which the next start deletes once it
-- has ended, and the queue of indicators the live run has still to answer.
-- not_checked is a JSON array in text. A deleted indicator takes its queue
-- row with it.
CREATE TABLE IF NOT EXISTS hfa_verification_runs (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'stopping', 'completed', 'stopped', 'error')),
  started_by TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  done INTEGER NOT NULL,
  not_checked TEXT NOT NULL,
  error TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hfa_verification_runs_one_live
  ON hfa_verification_runs ((true)) WHERE status IN ('running', 'stopping');

CREATE TABLE IF NOT EXISTS hfa_verification_queue (
  indicator_id TEXT PRIMARY KEY NOT NULL REFERENCES hfa_indicators(indicator_id) ON DELETE CASCADE,
  queued_by TEXT NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  requeue BOOLEAN NOT NULL DEFAULT false
);
