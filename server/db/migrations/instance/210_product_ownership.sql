-- Product ownership (PLAN_PRODUCT_OWNERSHIP). A product has one owner, a
-- general access for everyone else in the instance, and per-user grants.
-- Every product that exists when this runs gets general access 'view' from
-- the column default, and every insert in the code writes 'none'. Its owner
-- is created_by when that names a user, else none. Neither column references
-- users: the user delete and rename paths keep them consistent.

ALTER TABLE products ADD COLUMN IF NOT EXISTS owner text;

ALTER TABLE products ADD COLUMN IF NOT EXISTS default_access text NOT NULL DEFAULT 'view'
  CHECK (default_access IN ('none', 'view', 'edit'));

UPDATE products p SET owner = p.created_by
WHERE p.owner IS NULL
  AND EXISTS (SELECT 1 FROM users u WHERE u.email = p.created_by);

CREATE TABLE IF NOT EXISTS product_access (
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email text NOT NULL,
  level text NOT NULL CHECK (level IN ('view', 'edit')),
  PRIMARY KEY (product_id, email)
);

CREATE INDEX IF NOT EXISTS idx_product_access_email ON product_access(email);
