-- Scopes (PLAN_SCOPES). A product's scope was one column,
-- products.admin_area_2 (NULL = national). It becomes a row in `scopes` that
-- the product points at.
--
-- Seeding: the one reserved scope, id 'all-data', labelled "All data", on
-- every instance, fresh ones included, so a product can always be created.
-- Its definition includes every family and limits nothing. Then, on an
-- instance that still has products.admin_area_2, one scope per distinct area,
-- labelled with the area name: HMIS and HFA included and both held to that
-- area, ICEH included whole, which is what those products showed. Areas are
-- distinct case-insensitively, as the view predicate and the definition hash
-- compare them, and as scope labels must be: two spellings of one area share
-- a scope, and an area whose name is already a scope's label gets the suffix
-- " (area)". National products move to 'all-data'. The area scopes are
-- ordinary rows.
--
-- The backfill block is guarded on products.admin_area_2, which this
-- migration drops, so a second run and a fresh database both skip it.

CREATE TABLE IF NOT EXISTS scopes (
  id text PRIMARY KEY NOT NULL
    CHECK (id = 'all-data' OR id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  label text NOT NULL CHECK (label <> ''),
  definition text NOT NULL,
  created_by text,
  created_at text NOT NULL,
  last_updated text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS scopes_label_unique ON scopes (lower(label));

INSERT INTO scopes (id, label, definition, created_by, created_at, last_updated)
VALUES (
  'all-data',
  'All data',
  '{"hmis":{"include":true,"modules":null,"indicators":null,"adminArea2":null,"years":null},"hfa":{"include":true,"modules":null,"indicators":null,"adminArea2":null,"timePoints":null},"iceh":{"include":true,"modules":null,"indicators":null,"years":null}}',
  NULL,
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  stamp text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  seed record;
  area_scope_id text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'admin_area_2'
  ) THEN
    ALTER TABLE products ADD COLUMN IF NOT EXISTS scope_id text;

    FOR seed IN
      SELECT MIN(admin_area_2) AS area FROM products
      WHERE admin_area_2 IS NOT NULL
      GROUP BY UPPER(admin_area_2)
    LOOP
      -- An area scope is recognised by its definition, compared with both
      -- areas upper-cased, so a run that stopped after seeding finds its own
      -- row again.
      SELECT s.id INTO area_scope_id FROM scopes s
      WHERE jsonb_set(
          jsonb_set(
            s.definition::jsonb, '{hmis,adminArea2}',
            to_jsonb(UPPER(s.definition::jsonb #>> '{hmis,adminArea2}'))
          ),
          '{hfa,adminArea2}',
          to_jsonb(UPPER(s.definition::jsonb #>> '{hfa,adminArea2}'))
        ) = jsonb_build_object(
          'hmis', jsonb_build_object(
            'include', TRUE, 'modules', NULL, 'indicators', NULL,
            'adminArea2', UPPER(seed.area), 'years', NULL
          ),
          'hfa', jsonb_build_object(
            'include', TRUE, 'modules', NULL, 'indicators', NULL,
            'adminArea2', UPPER(seed.area), 'timePoints', NULL
          ),
          'iceh', jsonb_build_object(
            'include', TRUE, 'modules', NULL, 'indicators', NULL, 'years', NULL
          )
        )
      ORDER BY s.created_at, s.id
      LIMIT 1;

      IF area_scope_id IS NULL THEN
        area_scope_id := gen_random_uuid()::text;
        INSERT INTO scopes (id, label, definition, created_by, created_at, last_updated)
        VALUES (
          area_scope_id,
          CASE
            WHEN EXISTS (SELECT 1 FROM scopes s WHERE LOWER(s.label) = LOWER(seed.area))
            THEN seed.area || ' (area)'
            ELSE seed.area
          END,
          json_build_object(
            'hmis', json_build_object(
              'include', TRUE, 'modules', NULL, 'indicators', NULL,
              'adminArea2', seed.area, 'years', NULL
            ),
            'hfa', json_build_object(
              'include', TRUE, 'modules', NULL, 'indicators', NULL,
              'adminArea2', seed.area, 'timePoints', NULL
            ),
            'iceh', json_build_object(
              'include', TRUE, 'modules', NULL, 'indicators', NULL, 'years', NULL
            )
          )::text,
          NULL, stamp, stamp
        );
      END IF;

      UPDATE products SET scope_id = area_scope_id
      WHERE UPPER(admin_area_2) = UPPER(seed.area) AND scope_id IS NULL;
    END LOOP;

    UPDATE products SET scope_id = 'all-data'
    WHERE admin_area_2 IS NULL AND scope_id IS NULL;

    ALTER TABLE products ALTER COLUMN scope_id SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'products_scope_id_fkey'
    ) THEN
      ALTER TABLE products
        ADD CONSTRAINT products_scope_id_fkey
        FOREIGN KEY (scope_id) REFERENCES scopes(id);
    END IF;

    ALTER TABLE products DROP COLUMN admin_area_2;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_scope_id ON products(scope_id);
