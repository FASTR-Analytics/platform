-- ============================================================================
-- Split facilities into facilities_hmis + facilities_hfa (independent facility
-- registries per dataset family, identical shape) and add hfa_facility_weights
-- (sampling weights, per facility per time point).
--
-- Fresh installs get the final state from _main_database.sql: the CREATEs
-- below no-op via IF NOT EXISTS and the DO block no-ops because the legacy
-- facilities table does not exist. The repointed FK constraint names must stay
-- exactly dataset_hmis_facility_id_fkey / hfa_data_facility_id_fkey — the
-- SET CONSTRAINTS statement in integrate_structure_from_staging.ts uses them.
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
  facility_custom_5 text,
  FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_areas ON facilities_hmis(admin_area_4, admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_area_1 ON facilities_hmis(admin_area_1);
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_area_2 ON facilities_hmis(admin_area_2);
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_area_3 ON facilities_hmis(admin_area_3);
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_admin_area_4 ON facilities_hmis(admin_area_4);
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_facility_type ON facilities_hmis(facility_type) WHERE facility_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facilities_hmis_facility_ownership ON facilities_hmis(facility_ownership) WHERE facility_ownership IS NOT NULL;

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
  facility_custom_5 text,
  FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_areas ON facilities_hfa(admin_area_4, admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_area_1 ON facilities_hfa(admin_area_1);
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_area_2 ON facilities_hfa(admin_area_2);
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_area_3 ON facilities_hfa(admin_area_3);
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_admin_area_4 ON facilities_hfa(admin_area_4);
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_facility_type ON facilities_hfa(facility_type) WHERE facility_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_facilities_hfa_facility_ownership ON facilities_hfa(facility_ownership) WHERE facility_ownership IS NOT NULL;

CREATE TABLE IF NOT EXISTS hfa_facility_weights (
  facility_id text NOT NULL,
  time_point text NOT NULL,
  weight double precision NOT NULL CHECK (weight >= 0),
  PRIMARY KEY (facility_id, time_point),
  FOREIGN KEY (facility_id) REFERENCES facilities_hfa(facility_id) ON DELETE CASCADE,
  FOREIGN KEY (time_point) REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hfa_facility_weights_time_point ON hfa_facility_weights(time_point);

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

    ALTER TABLE dataset_hmis DROP CONSTRAINT IF EXISTS dataset_hmis_facility_id_fkey;
    ALTER TABLE dataset_hmis
      ADD CONSTRAINT dataset_hmis_facility_id_fkey
      FOREIGN KEY (facility_id)
      REFERENCES facilities_hmis(facility_id)
      ON DELETE RESTRICT
      DEFERRABLE;

    ALTER TABLE hfa_data DROP CONSTRAINT IF EXISTS hfa_data_facility_id_fkey;
    ALTER TABLE hfa_data
      ADD CONSTRAINT hfa_data_facility_id_fkey
      FOREIGN KEY (facility_id)
      REFERENCES facilities_hfa(facility_id)
      ON DELETE RESTRICT
      DEFERRABLE;

    DROP TABLE facilities;
  END IF;
END $$;
