-- Fix slide timestamp columns to use text instead of timestamp
-- This resolves conflicts on every save caused by timestamp format mismatches

DO $$
BEGIN
  -- Fix slide_decks.last_updated
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'slide_decks'
    AND column_name = 'last_updated'
    AND data_type IN ('timestamp without time zone', 'timestamp with time zone')
  ) THEN
    ALTER TABLE slide_decks
      ALTER COLUMN last_updated TYPE text USING to_char(last_updated, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;

  -- Fix slides.last_updated
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'slides'
    AND column_name = 'last_updated'
    AND data_type IN ('timestamp without time zone', 'timestamp with time zone')
  ) THEN
    ALTER TABLE slides
      ALTER COLUMN last_updated TYPE text USING to_char(last_updated, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  END IF;
END $$;
