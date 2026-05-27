CREATE TABLE IF NOT EXISTS dashboards (
  id text PRIMARY KEY NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  is_public boolean NOT NULL DEFAULT FALSE,
  layout text NOT NULL,
  created_by_email text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  last_updated text NOT NULL,
  UNIQUE(slug)
);

CREATE INDEX IF NOT EXISTS idx_dashboards_slug ON dashboards(slug);
CREATE INDEX IF NOT EXISTS idx_dashboards_last_updated ON dashboards(last_updated);

CREATE TABLE IF NOT EXISTS dashboard_items (
  id text PRIMARY KEY NOT NULL,
  dashboard_id text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL,
  figure_block text NOT NULL,
  geo_data text,
  last_updated text NOT NULL,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dashboard_items_dashboard_id ON dashboard_items(dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_items_dashboard_sort ON dashboard_items(dashboard_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_dashboard_items_last_updated ON dashboard_items(last_updated);
