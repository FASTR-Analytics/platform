CREATE TABLE IF NOT EXISTS hfa_indicator_variant_groups (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hfa_indicator_variant_items (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL REFERENCES hfa_indicator_variant_groups(id) ON UPDATE CASCADE ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Deliberately ON DELETE RESTRICT (default NO ACTION): deleting a group that
-- any indicator still references is refused.
ALTER TABLE hfa_indicators
  ADD COLUMN IF NOT EXISTS variant_group_id TEXT REFERENCES hfa_indicator_variant_groups(id) ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS hfa_indicator_variant_code (
  var_name TEXT NOT NULL REFERENCES hfa_indicators(var_name) ON DELETE CASCADE,
  time_point TEXT NOT NULL REFERENCES hfa_time_points(label) ON UPDATE CASCADE ON DELETE RESTRICT,
  item_id TEXT NOT NULL REFERENCES hfa_indicator_variant_items(id) ON UPDATE CASCADE ON DELETE CASCADE,
  r_code TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (var_name, time_point, item_id)
);
