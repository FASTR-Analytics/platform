-- Drop legacy reports tables (replaced by slide_decks).
--
-- The legacy `reports` table had a `report_items` child (dropped first below).
-- A NEW, unrelated `reports` table was later reintroduced (migration 020) and
-- gained a `report_versions` FK dependent (migration 032). On a fresh DB the base
-- schema (_project_database.sql) already builds that modern shape, so this
-- migration must NOT drop it. Only act when `report_versions` is absent — i.e.
-- when we are looking at the old legacy schema.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'report_versions'
  ) THEN
    DROP TABLE IF EXISTS report_items;
    DROP TABLE IF EXISTS reports;
  END IF;
END $$;
