-- Add variant_label column to metrics table for grouping similar metrics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'metrics'
    AND column_name = 'variant_label'
  ) THEN
    ALTER TABLE metrics ADD COLUMN variant_label TEXT;
  END IF;
END $$;
