-- Results-package wizard (PLAN_RESULTS_RUNS item 2): the launch wizard's
-- attempt record (structure_upload_attempts pattern — one configuring
-- attempt per source project; status_type is only ever 'configuring',
-- execution state never touches the attempt; deleted at launch/discard) and
-- the run pipeline's progress column (worker-updated JSON, pushed over
-- project SSE as run_progress).

CREATE TABLE IF NOT EXISTS run_generation_attempts (
  source_project_id text NOT NULL,
  date_started text NOT NULL,
  step integer NOT NULL,
  status text NOT NULL,
  status_type text NOT NULL,
  step_1_result text,
  step_2_result text,
  CONSTRAINT run_generation_attempts_pkey PRIMARY KEY (source_project_id),
  CONSTRAINT run_generation_attempts_project_fkey
    FOREIGN KEY (source_project_id) REFERENCES projects(id) ON DELETE CASCADE
);

ALTER TABLE runs ADD COLUMN IF NOT EXISTS progress text;
