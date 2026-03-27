CREATE TABLE IF NOT EXISTS hfa_indicators (
  var_name TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL DEFAULT '',
  r_code TEXT NOT NULL DEFAULT '',
  r_filter_code TEXT,
  type TEXT NOT NULL CHECK (type IN ('binary', 'numeric')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
