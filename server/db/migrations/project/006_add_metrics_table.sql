-- Create results_objects table if it doesn't exist
CREATE TABLE IF NOT EXISTS results_objects (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL,
  description text NOT NULL,
  column_definitions text,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_results_objects_module_id ON results_objects(module_id);

-- Create metrics table if it doesn't exist
CREATE TABLE IF NOT EXISTS metrics (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL,
  label text NOT NULL,
  value_func text NOT NULL CHECK (value_func IN ('SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'identity')),
  format_as text NOT NULL CHECK (format_as IN ('percent', 'number')),
  value_props text NOT NULL,
  period_options text NOT NULL,
  required_disaggregation_options text NOT NULL,
  value_label_replacements text,
  post_aggregation_expression text,
  auto_include_facility_columns boolean DEFAULT false,
  table_routing text NOT NULL,
  ai_description text,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_module_id ON metrics(module_id);

-- Add metric_id column to presentation_objects if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'presentation_objects'
    AND column_name = 'metric_id'
  ) THEN
    ALTER TABLE presentation_objects ADD COLUMN metric_id text;
  END IF;
END $$;

-- Add index on metric_id
CREATE INDEX IF NOT EXISTS idx_presentation_objects_metric_id ON presentation_objects(metric_id);

-- NOTE: Old columns (module_id, results_object_id, results_value) are dropped by
-- the JS migration (migrateToMetricsTables) after it populates metric_id
