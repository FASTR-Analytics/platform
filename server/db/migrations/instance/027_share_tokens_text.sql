DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'share_tokens'
    AND column_name = 'data'
    AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE share_tokens ALTER COLUMN data TYPE TEXT;
  END IF;
END $$;
