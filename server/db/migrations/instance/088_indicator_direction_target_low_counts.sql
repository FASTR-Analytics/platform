-- ============================================================================
-- Three facts on the HMIS indicator: direction, target, expected low counts.
--
-- `direction` says whether a higher value is better or worse. It is the ONE
-- direction: an indicator's conditional-formatting rule takes its
-- `direction` key from this column on every write. Every row starts at
-- higher-is-better, and every stored rule loses its own key so the two
-- agree; a rule authored as lower-is-better reads as higher-is-better until
-- its indicator's direction is set. `target` is a number in STORED units (a
-- fraction for a percent), on a derived indicator only, like `thresholds`.
-- `expected_low_counts` marks a count whose facility-month values are
-- expected to be small, for the adjustment modules; a derived indicator is
-- never adjusted, so it is FALSE there. No updated_at moves.
--
-- Replay (./validate_migrations, and every boot): the columns and
-- constraints exist as _main_database.sql declares them, and the UPDATE
-- matches no row.
-- ============================================================================

ALTER TABLE indicators ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'higher-is-better';
ALTER TABLE indicators ADD COLUMN IF NOT EXISTS target double precision;
ALTER TABLE indicators ADD COLUMN IF NOT EXISTS expected_low_counts boolean NOT NULL DEFAULT FALSE;

UPDATE indicators
SET thresholds = (thresholds::jsonb - 'direction')::text
WHERE thresholds IS NOT NULL AND thresholds::jsonb ? 'direction';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicators_direction_check') THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_direction_check
      CHECK (direction IN ('higher-is-better', 'lower-is-better'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicators_count_target_check') THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_count_target_check
      CHECK (NOT is_count OR target IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicators_derived_low_counts_check') THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_derived_low_counts_check
      CHECK (is_count OR NOT expected_low_counts);
  END IF;
END $$;
