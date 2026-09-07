-- ============================================================================
-- Per-family structure split (PLAN_2_STRUCTURE_FAMILY_SPLIT):
--
-- 1. Config: copy the legacy global max_admin_area + facility_columns rows
--    into per-family structure_schema_hmis / structure_schema_hfa rows.
--    Legacy config rows are NOT deleted here — they stay as the rollback
--    path (a pre-076 image reads them on every request); a later hygiene
--    migration drops them (PLAN_REMOVE_OLD_STRUCTURE_TABLES.md).
-- 2. Create the eight per-family admin-area tree tables.
-- 3. Populate each family's tree by derivation from its facilities table
--    (the cleanup invariant makes this exact; FK-consistent by construction).
-- 4. Repoint each facilities table's composite FK from shared admin_areas_4
--    to its family's level-4 table.
-- 5. geojson_maps: add facility_family, repoint the PK; existing rows are
--    copied to each family that has facilities (hmis if neither does).
-- 6. Legacy admin_areas_1..4 are kept, frozen (no reader, no writer), as the
--    rollback path; a later hygiene migration drops them
--    (PLAN_REMOVE_OLD_STRUCTURE_TABLES.md).
--
-- Fresh installs get the final state from _main_database.sql: every statement
-- below no-ops (IF NOT EXISTS / guarded DO blocks / zero-row INSERT..SELECTs;
-- the legacy tables and config rows do not exist).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Config-row copy (pure copy: both families get identical content, which is
--    exactly what they have today). If the max_admin_area row is missing (an
--    instance that already cannot boot its UI), the SELECT yields zero rows
--    and no schema row is created.
-- ----------------------------------------------------------------------------

INSERT INTO instance_config (config_key, config_json_value)
SELECT
  'structure_schema_hmis',
  (
    COALESCE(
      (SELECT fc.config_json_value::jsonb FROM instance_config fc WHERE fc.config_key = 'facility_columns'),
      '{"includeNames":false,"includeTypes":false,"includeOwnership":false,"includeCustom1":false,"includeCustom2":false,"includeCustom3":false,"includeCustom4":false,"includeCustom5":false}'::jsonb
    )
    || jsonb_build_object('adminDepth', (ma.config_json_value::jsonb)->'maxAdminArea')
  )::text
FROM instance_config ma
WHERE ma.config_key = 'max_admin_area'
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO instance_config (config_key, config_json_value)
SELECT
  'structure_schema_hfa',
  (
    COALESCE(
      (SELECT fc.config_json_value::jsonb FROM instance_config fc WHERE fc.config_key = 'facility_columns'),
      '{"includeNames":false,"includeTypes":false,"includeOwnership":false,"includeCustom1":false,"includeCustom2":false,"includeCustom3":false,"includeCustom4":false,"includeCustom5":false}'::jsonb
    )
    || jsonb_build_object('adminDepth', (ma.config_json_value::jsonb)->'maxAdminArea')
  )::text
FROM instance_config ma
WHERE ma.config_key = 'max_admin_area'
ON CONFLICT (config_key) DO NOTHING;

-- Reset parked structure imports: a parked wizard references the legacy global
-- config and the shared trees, neither of which exists after this deploy.
DELETE FROM structure_upload_attempts;
DROP TABLE IF EXISTS temp_structure_staging_hmis;
DROP TABLE IF EXISTS temp_structure_staging_hfa;

-- ----------------------------------------------------------------------------
-- 2. The eight per-family tree tables (same shape as the legacy shared trees).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_areas_hmis_1 (
  admin_area_1 text PRIMARY KEY NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_areas_hmis_2 (
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_1) REFERENCES admin_areas_hmis_1 (admin_area_1) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_areas_hmis_2_admin_area_1 ON admin_areas_hmis_2(admin_area_1);
CREATE INDEX IF NOT EXISTS idx_admin_areas_hmis_2_admin_area_2 ON admin_areas_hmis_2(admin_area_2);

CREATE TABLE IF NOT EXISTS admin_areas_hmis_3 (
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_2, admin_area_1) REFERENCES admin_areas_hmis_2 (admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_areas_hmis_3_admin_area_2_admin_area_1 ON admin_areas_hmis_3(admin_area_2, admin_area_1);
CREATE INDEX IF NOT EXISTS idx_admin_areas_hmis_3_admin_area_3 ON admin_areas_hmis_3(admin_area_3);
CREATE INDEX IF NOT EXISTS idx_admin_areas_hmis_3_admin_area_2 ON admin_areas_hmis_3(admin_area_2);

CREATE TABLE IF NOT EXISTS admin_areas_hmis_4 (
  admin_area_4 text NOT NULL,
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_hmis_3 (admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_areas_hmis_4_admin_area_3_admin_area_2_admin_area_1 ON admin_areas_hmis_4(admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX IF NOT EXISTS idx_admin_areas_hmis_4_admin_area_4 ON admin_areas_hmis_4(admin_area_4);

CREATE TABLE IF NOT EXISTS admin_areas_hfa_1 (
  admin_area_1 text PRIMARY KEY NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_areas_hfa_2 (
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_1) REFERENCES admin_areas_hfa_1 (admin_area_1) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_areas_hfa_2_admin_area_1 ON admin_areas_hfa_2(admin_area_1);
CREATE INDEX IF NOT EXISTS idx_admin_areas_hfa_2_admin_area_2 ON admin_areas_hfa_2(admin_area_2);

CREATE TABLE IF NOT EXISTS admin_areas_hfa_3 (
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_2, admin_area_1) REFERENCES admin_areas_hfa_2 (admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_areas_hfa_3_admin_area_2_admin_area_1 ON admin_areas_hfa_3(admin_area_2, admin_area_1);
CREATE INDEX IF NOT EXISTS idx_admin_areas_hfa_3_admin_area_3 ON admin_areas_hfa_3(admin_area_3);
CREATE INDEX IF NOT EXISTS idx_admin_areas_hfa_3_admin_area_2 ON admin_areas_hfa_3(admin_area_2);

CREATE TABLE IF NOT EXISTS admin_areas_hfa_4 (
  admin_area_4 text NOT NULL,
  admin_area_3 text NOT NULL,
  admin_area_2 text NOT NULL,
  admin_area_1 text NOT NULL,
  PRIMARY KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1),
  FOREIGN KEY (admin_area_3, admin_area_2, admin_area_1) REFERENCES admin_areas_hfa_3 (admin_area_3, admin_area_2, admin_area_1) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_areas_hfa_4_admin_area_3_admin_area_2_admin_area_1 ON admin_areas_hfa_4(admin_area_3, admin_area_2, admin_area_1);
CREATE INDEX IF NOT EXISTS idx_admin_areas_hfa_4_admin_area_4 ON admin_areas_hfa_4(admin_area_4);

-- ----------------------------------------------------------------------------
-- 3. Populate by derivation from each family's facilities table (level 1 -> 4
--    for the FK chain). Facilities rows carry full padded NOT NULL paths, so
--    the result is FK-consistent by construction. ON CONFLICT DO NOTHING makes
--    a re-run a no-op.
-- ----------------------------------------------------------------------------

INSERT INTO admin_areas_hmis_1 (admin_area_1)
SELECT DISTINCT admin_area_1 FROM facilities_hmis
ON CONFLICT DO NOTHING;

INSERT INTO admin_areas_hmis_2 (admin_area_2, admin_area_1)
SELECT DISTINCT admin_area_2, admin_area_1 FROM facilities_hmis
ON CONFLICT DO NOTHING;

INSERT INTO admin_areas_hmis_3 (admin_area_3, admin_area_2, admin_area_1)
SELECT DISTINCT admin_area_3, admin_area_2, admin_area_1 FROM facilities_hmis
ON CONFLICT DO NOTHING;

INSERT INTO admin_areas_hmis_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
SELECT DISTINCT admin_area_4, admin_area_3, admin_area_2, admin_area_1 FROM facilities_hmis
ON CONFLICT DO NOTHING;

INSERT INTO admin_areas_hfa_1 (admin_area_1)
SELECT DISTINCT admin_area_1 FROM facilities_hfa
ON CONFLICT DO NOTHING;

INSERT INTO admin_areas_hfa_2 (admin_area_2, admin_area_1)
SELECT DISTINCT admin_area_2, admin_area_1 FROM facilities_hfa
ON CONFLICT DO NOTHING;

INSERT INTO admin_areas_hfa_3 (admin_area_3, admin_area_2, admin_area_1)
SELECT DISTINCT admin_area_3, admin_area_2, admin_area_1 FROM facilities_hfa
ON CONFLICT DO NOTHING;

INSERT INTO admin_areas_hfa_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
SELECT DISTINCT admin_area_4, admin_area_3, admin_area_2, admin_area_1 FROM facilities_hfa
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Repoint each facilities table's composite FK from shared admin_areas_4 to
--    its family's level-4 table. The legacy FK constraint names are
--    auto-generated, so they are looked up, never hardcoded. On fresh installs
--    admin_areas_4 does not exist (guarded) and the family FK already exists
--    from the base schema (guarded).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  con record;
BEGIN
  IF to_regclass('public.admin_areas_4') IS NOT NULL THEN
    FOR con IN
      SELECT c.conname, c.conrelid::regclass::text AS tbl
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.confrelid = 'public.admin_areas_4'::regclass
        AND c.conrelid IN ('public.facilities_hmis'::regclass, 'public.facilities_hfa'::regclass)
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', con.tbl, con.conname);
    END LOOP;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid = 'public.facilities_hmis'::regclass
      AND confrelid = 'public.admin_areas_hmis_4'::regclass
  ) THEN
    ALTER TABLE facilities_hmis
      ADD FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
      REFERENCES admin_areas_hmis_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'f'
      AND conrelid = 'public.facilities_hfa'::regclass
      AND confrelid = 'public.admin_areas_hfa_4'::regclass
  ) THEN
    ALTER TABLE facilities_hfa
      ADD FOREIGN KEY (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
      REFERENCES admin_areas_hfa_4 (admin_area_4, admin_area_3, admin_area_2, admin_area_1)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. geojson_maps: add facility_family and repoint the PK. Existing rows are
--    copied to each family that has facilities (today's single map served both
--    registries); if neither family has facilities, assign to hmis. The PK is
--    dropped BEFORE duplication (the legacy PK is admin_area_level alone).
--    Entirely inside the column-absent guard, so a re-run is a no-op.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'geojson_maps' AND column_name = 'facility_family'
  ) THEN
    ALTER TABLE geojson_maps ADD COLUMN facility_family text;
    ALTER TABLE geojson_maps DROP CONSTRAINT geojson_maps_pkey;

    IF EXISTS (SELECT 1 FROM facilities_hfa) THEN
      IF EXISTS (SELECT 1 FROM facilities_hmis) THEN
        INSERT INTO geojson_maps (facility_family, admin_area_level, geojson, uploaded_at)
        SELECT 'hfa', admin_area_level, geojson, uploaded_at
        FROM geojson_maps
        WHERE facility_family IS NULL;
        UPDATE geojson_maps SET facility_family = 'hmis' WHERE facility_family IS NULL;
      ELSE
        UPDATE geojson_maps SET facility_family = 'hfa' WHERE facility_family IS NULL;
      END IF;
    ELSE
      UPDATE geojson_maps SET facility_family = 'hmis' WHERE facility_family IS NULL;
    END IF;

    ALTER TABLE geojson_maps ALTER COLUMN facility_family SET NOT NULL;
    ALTER TABLE geojson_maps ADD CONSTRAINT geojson_maps_facility_family_check CHECK (facility_family IN ('hmis', 'hfa'));
    ALTER TABLE geojson_maps ADD PRIMARY KEY (facility_family, admin_area_level);
  END IF;
END $$;

-- 6. Legacy admin_areas_1..4 are intentionally kept, frozen — detached from
--    everything, retained only as the rollback path. A later hygiene
--    migration drops them together with the legacy max_admin_area /
--    facility_columns config rows (PLAN_REMOVE_OLD_STRUCTURE_TABLES.md).
