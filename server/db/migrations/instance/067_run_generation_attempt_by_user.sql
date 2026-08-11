-- Results-package wizard moves to the instance shell (PLAN_RESULTS_RUNS
-- Phase 3 item 1): generation is an instance-level act, so the attempt
-- record is keyed by the admin configuring it — one in-flight configuration
-- per user — instead of by a source project.
--
-- Attempts are configuration only and are deleted at launch, so the re-key
-- drops any in-flight rows rather than trying to reassign them.

DROP TABLE IF EXISTS run_generation_attempts;

CREATE TABLE run_generation_attempts (
  created_by_user_email text NOT NULL,
  date_started text NOT NULL,
  step integer NOT NULL,
  status text NOT NULL,
  status_type text NOT NULL,
  step_1_result text,
  step_2_result text,
  CONSTRAINT run_generation_attempts_pkey PRIMARY KEY (created_by_user_email),
  CONSTRAINT run_generation_attempts_user_fkey
    FOREIGN KEY (created_by_user_email) REFERENCES users(email) ON DELETE CASCADE
);
