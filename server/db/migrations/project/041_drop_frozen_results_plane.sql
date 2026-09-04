-- Phase 4 of the results-runs model: the frozen Postgres results plane
-- leaves the project DB. Every project has served from results packages since
-- 1.67.0; these tables were write-only fingerprints after that. On a fresh DB
-- none of them exist (the base schema no longer creates them and every older
-- migration that touched them is guarded on table existence), so this is a
-- no-op there.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name ~ '^ro_'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.table_name);
  END LOOP;
END $$;

DROP TABLE IF EXISTS metrics, results_objects, modules,
  calculated_indicators_snapshot, global_last_updated CASCADE;
