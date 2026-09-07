-- The results-package wizard became an ephemeral modal (2026-08-17, Tim's
-- ruling): its step results are client-local until launch sends the whole
-- configuration in one body, so the per-admin attempt record is dead. Rows
-- were only ever in-flight configurations, dropped rather than migrated.
DROP TABLE IF EXISTS run_generation_attempts;
