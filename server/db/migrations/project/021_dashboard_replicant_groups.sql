-- Dashboard replicant groups: a replicated visualization (one chart × N
-- replicants) can be added as ONE group instead of N flat items, while still
-- snapshotting every replicant's data. See PLAN_DASHBOARD_REPLICANT_GROUPS.md.

CREATE TABLE IF NOT EXISTS dashboard_item_groups (
  id text PRIMARY KEY NOT NULL,
  dashboard_id text NOT NULL,
  label text NOT NULL,
  replicate_by text NOT NULL,
  default_replicant_value text,
  replicants text NOT NULL,            -- JSON: ordered [{ value, label }]
  geo_data text,                       -- shared geojson for all members (maps); null otherwise
  last_updated text NOT NULL,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dashboard_item_groups_dashboard_id ON dashboard_item_groups(dashboard_id);

-- A member row points at its group; deleting the group cascades to its members.
ALTER TABLE dashboard_items ADD COLUMN IF NOT EXISTS replicant_group_id text;
ALTER TABLE dashboard_items ADD COLUMN IF NOT EXISTS replicant_value text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_items_replicant_group_id_fkey'
  ) THEN
    ALTER TABLE dashboard_items
      ADD CONSTRAINT dashboard_items_replicant_group_id_fkey
      FOREIGN KEY (replicant_group_id) REFERENCES dashboard_item_groups(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dashboard_items_replicant_group_id ON dashboard_items(replicant_group_id);
