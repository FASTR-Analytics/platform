-- Make hfa_data facility_id FK deferrable to match dataset_hmis behavior
-- This allows "replace all" structure import to work when HFA data exists

-- Also guarded on facilities existing: on fresh installs after migration 047
-- (facilities split), hfa_data's FK already points at facilities_hfa and this
-- block must not touch it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hfa_data')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'facilities') THEN
    -- Drop existing constraint (may be non-deferrable from migration 023)
    ALTER TABLE hfa_data DROP CONSTRAINT IF EXISTS hfa_data_facility_id_fkey;

    -- Re-add with DEFERRABLE
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'hfa_data_facility_id_fkey'
      AND table_name = 'hfa_data'
    ) THEN
      ALTER TABLE hfa_data
        ADD CONSTRAINT hfa_data_facility_id_fkey
        FOREIGN KEY (facility_id)
        REFERENCES facilities(facility_id)
        ON DELETE RESTRICT
        DEFERRABLE;
    END IF;
  END IF;
END $$;
