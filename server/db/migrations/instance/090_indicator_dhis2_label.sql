-- ============================================================================
-- The DHIS2 label: what DHIS2 calls a DHIS2 element's element or operand,
-- beside the display label the user authors.
--
-- 086 fills the column from the raw label on every instance that runs it
-- from here on. This migration exists for the instances that ran 086 before
-- the column was added to it (Mozambique and three testing instances, on
-- 1.73.x): they get the column with NULL in every row, since the raw label
-- was dropped with indicators_raw, and the DHIS2 picker fills it for each
-- element added from now on. The CHECK keeps the label to DHIS2 elements.
--
-- Replay (./validate_migrations, and every boot): the column and the
-- constraint exist as _main_database.sql declares them.
-- ============================================================================

ALTER TABLE indicators ADD COLUMN IF NOT EXISTS dhis2_label text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicators_dhis2_label_check') THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_dhis2_label_check
      CHECK (dhis2_label IS NULL OR definition_type = 'dhis2_element');
  END IF;
END $$;
