-- Results runs catalog + project run pointer (PLAN_RESULTS_RUNS §2.6).
-- runs.status: generating | ready | failed | retired. projects.run_id is only
-- ever set to a run with status='ready'; the FK (no cascade) makes a
-- referenced run undeletable at the DB level.

CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'generating',
  provenance text NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by text,
  summary text
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS run_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conname = 'projects_run_id_fkey'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_run_id_fkey FOREIGN KEY (run_id) REFERENCES runs(id);
  END IF;
END $$;
