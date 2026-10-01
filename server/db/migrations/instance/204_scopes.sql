-- Scopes (PLAN_SCOPES step 2). A product's scope was one column,
-- products.admin_area_2 (NULL = national). It becomes a row in `scopes` that
-- the product points at.
--
-- Seeding: one unconstrained scope labelled "All data" on an instance that
-- has no scope yet, fresh instances included, so a product can always be
-- created. Then, on an instance that still has products.admin_area_2, one
-- scope per distinct area, labelled with the area name. National products
-- move to the unconstrained scope. Seeded scopes are ordinary rows.
--
-- The backfill block is guarded on products.admin_area_2, which this
-- migration drops, so a second run and a fresh database both skip it.

CREATE TABLE IF NOT EXISTS scopes (
  id text PRIMARY KEY NOT NULL,
  label text NOT NULL,
  definition text NOT NULL,
  created_by text,
  created_at text,
  last_updated text NOT NULL
);

INSERT INTO scopes (id, label, definition, created_by, created_at, last_updated)
SELECT
  gen_random_uuid()::text,
  'All data',
  '{"geography":null,"time":{"years":null,"hfaTimePoints":null},"modules":null,"indicators":{"hmis":null,"hfa":null,"iceh":null}}',
  NULL,
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE NOT EXISTS (SELECT 1 FROM scopes);

DO $$
DECLARE
  stamp text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  unconstrained_id text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'admin_area_2'
  ) THEN
    ALTER TABLE products ADD COLUMN IF NOT EXISTS scope_id text;

    SELECT id INTO unconstrained_id FROM scopes
    WHERE definition::jsonb = '{"geography":null,"time":{"years":null,"hfaTimePoints":null},"modules":null,"indicators":{"hmis":null,"hfa":null,"iceh":null}}'::jsonb
    ORDER BY created_at, id
    LIMIT 1;

    IF unconstrained_id IS NULL THEN
      unconstrained_id := gen_random_uuid()::text;
      INSERT INTO scopes (id, label, definition, created_by, created_at, last_updated)
      VALUES (
        unconstrained_id,
        'All data',
        '{"geography":null,"time":{"years":null,"hfaTimePoints":null},"modules":null,"indicators":{"hmis":null,"hfa":null,"iceh":null}}',
        NULL, stamp, stamp
      );
    END IF;

    INSERT INTO scopes (id, label, definition, created_by, created_at, last_updated)
    SELECT
      gen_random_uuid()::text,
      areas.admin_area_2,
      json_build_object(
        'geography', json_build_object('adminArea2', areas.admin_area_2),
        'time', json_build_object('years', NULL, 'hfaTimePoints', NULL),
        'modules', NULL,
        'indicators', json_build_object('hmis', NULL, 'hfa', NULL, 'iceh', NULL)
      )::text,
      NULL, stamp, stamp
    FROM (
      SELECT DISTINCT admin_area_2 FROM products WHERE admin_area_2 IS NOT NULL
    ) areas
    WHERE NOT EXISTS (
      SELECT 1 FROM scopes s
      WHERE s.definition::jsonb = jsonb_build_object(
        'geography', jsonb_build_object('adminArea2', areas.admin_area_2),
        'time', jsonb_build_object('years', NULL, 'hfaTimePoints', NULL),
        'modules', NULL,
        'indicators', jsonb_build_object('hmis', NULL, 'hfa', NULL, 'iceh', NULL)
      )
    );

    UPDATE products p
    SET scope_id = (
      SELECT s.id FROM scopes s
      WHERE s.definition::jsonb = jsonb_build_object(
        'geography', jsonb_build_object('adminArea2', p.admin_area_2),
        'time', jsonb_build_object('years', NULL, 'hfaTimePoints', NULL),
        'modules', NULL,
        'indicators', jsonb_build_object('hmis', NULL, 'hfa', NULL, 'iceh', NULL)
      )
      ORDER BY s.created_at, s.id
      LIMIT 1
    )
    WHERE p.admin_area_2 IS NOT NULL AND p.scope_id IS NULL;

    UPDATE products SET scope_id = unconstrained_id
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
