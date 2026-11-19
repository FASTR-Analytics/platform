-- ============================================================================
-- An HMIS indicator may declare no direction.
--
-- `direction` NULL means undeclared: nobody chose whether a higher value is
-- better or worse, and nothing states a direction for the indicator. The
-- column loses its default and its NOT NULL, so a row created without a
-- direction is undeclared.
--
-- higher-is-better was the default every row started at (migration 088)
-- and the value every DHIS2 form wrote, so a stored higher-is-better cannot
-- be told from one nobody chose. Every such row with no conditional-
-- formatting rule and no target becomes undeclared. A lower-is-better row
-- was chosen, and a row with a rule or a target was curated, so both keep
-- their direction. No updated_at moves: this edits no indicator, and the
-- dictionary stamps computed from updated_at are what a package records of
-- the dictionary it was generated from.
--
-- A rule's bands have a good side, so a row with a rule declares a
-- direction (indicators_rule_direction_check).
--
-- Replay (./validate_migrations, a fresh database): the column and the
-- constraint exist as _main_database.sql declares them, and the UPDATE
-- matches no row.
-- ============================================================================

ALTER TABLE indicators ALTER COLUMN direction DROP DEFAULT;
ALTER TABLE indicators ALTER COLUMN direction DROP NOT NULL;

UPDATE indicators
SET direction = NULL
WHERE direction = 'higher-is-better'
  AND thresholds IS NULL
  AND target IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicators_rule_direction_check') THEN
    ALTER TABLE indicators ADD CONSTRAINT indicators_rule_direction_check
      CHECK (thresholds IS NULL OR direction IS NOT NULL);
  END IF;
END $$;
