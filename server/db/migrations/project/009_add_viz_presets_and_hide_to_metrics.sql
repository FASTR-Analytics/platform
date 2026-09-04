-- Guarded on the metrics table: absent on a fresh DB since 041.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'metrics'
  ) THEN
    ALTER TABLE metrics ADD COLUMN IF NOT EXISTS viz_presets text;
    ALTER TABLE metrics ADD COLUMN IF NOT EXISTS hide boolean DEFAULT false;
    ALTER TABLE metrics ADD COLUMN IF NOT EXISTS important_notes text;
  END IF;
END $$;
