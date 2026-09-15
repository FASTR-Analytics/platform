-- ============================================================================
-- The formula indicator type is `calculated`, no longer `derived`: the
-- stored value, the type CHECK, the fields CHECK and the low-counts CHECK's
-- name all follow. Rewritten rows move updated_at so every cached
-- dictionary payload is rebuilt.
--
-- Replay (./validate_migrations): the base declares the `calculated` form
-- and 087 re-creates the fields CHECK with `derived`, 088 adds the
-- low-counts CHECK under its old name, so both are re-created here
-- unconditionally, as 087 does, and the UPDATE matches no row.
-- ============================================================================

ALTER TABLE indicators DROP CONSTRAINT IF EXISTS indicators_definition_type_check;
ALTER TABLE indicators DROP CONSTRAINT IF EXISTS indicators_fields_check;
ALTER TABLE indicators DROP CONSTRAINT IF EXISTS indicators_derived_low_counts_check;

UPDATE indicators
SET definition_type = 'calculated', updated_at = CURRENT_TIMESTAMP
WHERE definition_type = 'derived';

ALTER TABLE indicators ADD CONSTRAINT indicators_definition_type_check
  CHECK (definition_type IN ('uploaded', 'dhis2_element', 'sum', 'calculated'));
ALTER TABLE indicators ADD CONSTRAINT indicators_fields_check CHECK (
  (definition_type = 'uploaded'      AND expression IS NULL AND data_id IS NOT NULL) OR
  (definition_type = 'dhis2_element' AND expression IS NULL AND data_id IS NOT NULL) OR
  (definition_type = 'sum'           AND expression IS NULL AND data_id IS NULL) OR
  (definition_type = 'calculated'    AND expression IS NOT NULL AND data_id IS NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicators_calculated_low_counts_check') THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_calculated_low_counts_check
      CHECK (is_count OR NOT expected_low_counts);
  END IF;
END $$;
