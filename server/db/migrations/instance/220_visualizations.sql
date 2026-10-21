-- A third product type: the visualization, one saved figure. The registry's
-- type CHECK admits it and its detail table hangs off products by the same
-- composite FK as reports and slide decks.
--
-- Replay (./validate_migrations): the base already declares both, so the
-- CHECK is re-created unconditionally under its own name and the table is
-- created only when missing.

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_type_check;
ALTER TABLE products ADD CONSTRAINT products_type_check
  CHECK (type IN ('slide_deck', 'report', 'visualization'));

CREATE TABLE IF NOT EXISTS visualizations (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL DEFAULT 'visualization' CHECK (type = 'visualization'),
  bundle text NOT NULL,
  crdt_state text,
  crdt_state_last_updated text,
  FOREIGN KEY (id, type) REFERENCES products(id, type) ON DELETE CASCADE
);
