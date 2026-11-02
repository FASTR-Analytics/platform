-- HFA indicator code is the platform's expression language, so its columns
-- drop R's name: code and filter_code on hfa_indicator_code, code on
-- hfa_indicator_variant_code. No constraint or index is named after them.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_code' AND column_name = 'r_code')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_code' AND column_name = 'code') THEN
    ALTER TABLE hfa_indicator_code RENAME COLUMN r_code TO code;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_code' AND column_name = 'r_filter_code')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_code' AND column_name = 'filter_code') THEN
    ALTER TABLE hfa_indicator_code RENAME COLUMN r_filter_code TO filter_code;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_variant_code' AND column_name = 'r_code')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hfa_indicator_variant_code' AND column_name = 'code') THEN
    ALTER TABLE hfa_indicator_variant_code RENAME COLUMN r_code TO code;
  END IF;
END $$;
