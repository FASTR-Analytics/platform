-- Fix timestamp columns to use timestamptz instead of timestamp without time zone
-- Only convert if column is not already timestamptz
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'indicator_mappings'
    AND column_name = 'updated_at'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE indicator_mappings
      ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'indicators'
    AND column_name = 'updated_at'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE indicators
      ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'indicators_raw'
    AND column_name = 'updated_at'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE indicators_raw
      ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
  END IF;
END $$;
