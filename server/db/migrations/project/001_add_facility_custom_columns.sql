-- Only add columns if the facilities table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'facilities') THEN
    ALTER TABLE facilities ADD COLUMN IF NOT EXISTS facility_custom_3 text;
    ALTER TABLE facilities ADD COLUMN IF NOT EXISTS facility_custom_4 text;
    ALTER TABLE facilities ADD COLUMN IF NOT EXISTS facility_custom_5 text;
  END IF;
END $$;
