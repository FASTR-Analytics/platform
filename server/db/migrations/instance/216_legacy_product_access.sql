-- Apply what 201_project_access_snapshot recorded before 202 dropped the
-- project layer: each consolidated product becomes private to its project's
-- members, who get the grants recorded for them. The staging tables are
-- created here too, so a database that never ran the snapshot passes through,
-- and dropped at the end.

CREATE TABLE IF NOT EXISTS legacy_project_products (
  product_id text PRIMARY KEY NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_product_grants (
  product_id text NOT NULL,
  email text NOT NULL,
  level text NOT NULL CHECK (level IN ('view', 'edit')),
  PRIMARY KEY (product_id, email)
);

UPDATE products SET default_access = 'none'
WHERE id IN (SELECT product_id FROM legacy_project_products);

INSERT INTO product_access (product_id, email, level)
SELECT g.product_id, g.email, g.level
FROM legacy_product_grants g
JOIN products p ON p.id = g.product_id
JOIN users u ON u.email = g.email
WHERE p.owner IS DISTINCT FROM g.email
ON CONFLICT (product_id, email) DO NOTHING;

DROP TABLE IF EXISTS legacy_product_grants, legacy_project_products;
