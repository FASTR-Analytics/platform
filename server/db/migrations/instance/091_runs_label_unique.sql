-- ============================================================================
-- Results-package labels are unique per instance, compared case- and
-- whitespace-insensitively. The wizard default ("Results package <date>")
-- collided on same-day launches, so existing duplicates are renamed first:
-- within a group the earliest row keeps its label and later rows get " (2)",
-- " (3)" in created_at order. A suffixed label can itself collide with a
-- label that already exists, hence the loop.
--
-- Replay (./validate_migrations, and every boot): no duplicates, index
-- exists as _main_database.sql declares it.
-- ============================================================================

DO $$
DECLARE
  changed integer;
BEGIN
  LOOP
    WITH ranked AS (
      SELECT id, label,
        row_number() OVER (
          PARTITION BY lower(trim(label)) ORDER BY created_at, id
        ) AS rn
      FROM runs
    )
    UPDATE runs r
    SET label = trim(ranked.label) || ' (' || ranked.rn || ')'
    FROM ranked
    WHERE r.id = ranked.id AND ranked.rn > 1;
    GET DIAGNOSTICS changed = ROW_COUNT;
    EXIT WHEN changed = 0;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS runs_label_unique ON runs (lower(trim(label)));
