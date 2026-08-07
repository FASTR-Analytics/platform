-- Declared-format migration (PLAN_EFFECTIVE_FORMAT): formatAs becomes a
-- three-way declaration. "indicator" = the metric's values ARE the displayed
-- indicator's own quantity, formatted per value via the indicator catalog.
--
-- 1. Relax the CHECK to admit 'indicator'.
-- 2. Flip the 8 installed metrics whose stored two-way value predates the
--    declaration. Frozen history — this list never grows (a future
--    "indicator" metric installs as one from day one); the same frozen list
--    appears in manifest_transform block 2 and the figure-block sweep.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'metrics'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%format_as%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%indicator%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE metrics DROP CONSTRAINT ' || quote_ident(c.conname)
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'metrics'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%format_as%'
      LIMIT 1
    );
    ALTER TABLE metrics ADD CONSTRAINT metrics_format_as_check
      CHECK (format_as IN ('percent', 'number', 'indicator'));
  END IF;
END $$;

UPDATE metrics SET format_as = 'indicator'
WHERE id IN (
  'm7-01-01',
  'm7-01-02',
  'm7-01-03',
  'm8-01-01',
  'm10-01-01',
  'm10-01-02',
  'm10-03-01',
  'm10-03-02'
) AND format_as <> 'indicator';
