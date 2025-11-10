-- Fix indicators column name (only if old column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'indicators'
    AND column_name = 'indicator_label'
  ) THEN
    ALTER TABLE indicators
      RENAME COLUMN indicator_label TO indicator_common_label;
  END IF;
END $$;

-- Create results_objects table if it doesn't exist
CREATE TABLE IF NOT EXISTS results_objects (
  id text PRIMARY KEY NOT NULL,
  module_id text NOT NULL,
  description text NOT NULL,
  column_definitions text,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_results_objects_module_id ON results_objects(module_id);

-- Create results_values table if it doesn't exist
CREATE TABLE IF NOT EXISTS results_values (
  id text PRIMARY KEY NOT NULL,
  results_object_id text NOT NULL,
  module_id text NOT NULL,
  label text NOT NULL,
  value_func text NOT NULL CHECK (value_func IN ('SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'identity')),
  format_as text NOT NULL CHECK (format_as IN ('percent', 'number')),
  value_props text NOT NULL,
  period_options text NOT NULL,
  disaggregation_options text NOT NULL,
  value_label_replacements text,
  post_aggregation_expression text,
  auto_include_facility_columns boolean DEFAULT false,
  FOREIGN KEY (results_object_id) REFERENCES results_objects(id) ON DELETE CASCADE,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_results_values_results_object_id ON results_values(results_object_id);
CREATE INDEX IF NOT EXISTS idx_results_values_module_id ON results_values(module_id);
