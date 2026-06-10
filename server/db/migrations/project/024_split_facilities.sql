-- ============================================================================
-- Split the project-DB facilities snapshot into facilities_hmis +
-- facilities_hfa (paired with instance migration 047_split_facilities.sql).
-- Project DBs have no admin_areas tables, so no FKs — same as before.
--
-- Fresh project DBs get the final state from _project_database.sql: the
-- CREATEs no-op via IF NOT EXISTS and the DO block no-ops because the legacy
-- facilities table does not exist.
-- ============================================================================

CREATE TABLE IF NOT EXISTS facilities_hmis (
  facility_id text PRIMARY KEY NOT NULL,
  admin_area_4 text NOT NULL,
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  facility_name text,
  facility_type text,
  facility_ownership text,
  facility_custom_1 text,
  facility_custom_2 text,
  facility_custom_3 text,
  facility_custom_4 text,
  facility_custom_5 text
);

CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_areas ON facilities_hmis(admin_area_4, admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_area_1 ON facilities_hmis(admin_area_1);
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_area_2 ON facilities_hmis(admin_area_2);
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_area_3 ON facilities_hmis(admin_area_3);
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_area_4 ON facilities_hmis(admin_area_4);

CREATE TABLE IF NOT EXISTS facilities_hfa (
  facility_id text PRIMARY KEY NOT NULL,
  admin_area_4 text NOT NULL,
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  facility_name text,
  facility_type text,
  facility_ownership text,
  facility_custom_1 text,
  facility_custom_2 text,
  facility_custom_3 text,
  facility_custom_4 text,
  facility_custom_5 text
);

CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_areas ON facilities_hfa(admin_area_4, admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_area_1 ON facilities_hfa(admin_area_1);
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_area_2 ON facilities_hfa(admin_area_2);
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_area_3 ON facilities_hfa(admin_area_3);
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_area_4 ON facilities_hfa(admin_area_4);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'facilities') THEN

    INSERT INTO facilities_hmis (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1, facility_name, facility_type, facility_ownership, facility_custom_1, facility_custom_2, facility_custom_3, facility_custom_4, facility_custom_5)
    SELECT facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1, facility_name, facility_type, facility_ownership, facility_custom_1, facility_custom_2, facility_custom_3, facility_custom_4, facility_custom_5
    FROM facilities
    ON CONFLICT (facility_id) DO NOTHING;

    INSERT INTO facilities_hfa (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1, facility_name, facility_type, facility_ownership, facility_custom_1, facility_custom_2, facility_custom_3, facility_custom_4, facility_custom_5)
    SELECT facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1, facility_name, facility_type, facility_ownership, facility_custom_1, facility_custom_2, facility_custom_3, facility_custom_4, facility_custom_5
    FROM facilities
    ON CONFLICT (facility_id) DO NOTHING;

    DROP TABLE facilities;
  END IF;
END $$;
