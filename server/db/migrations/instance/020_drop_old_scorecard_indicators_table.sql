-- Cleanup migration for instances that ran the original 019 migration when
-- the catalog was still called "scorecard_indicators". The table was renamed
-- to "calculated_indicators" before phase 1 shipped, but the old table
-- (populated with seed rows) is left behind on those instances.
--
-- IF EXISTS makes this a no-op for fresh installs and for instances that
-- never ran the pre-rename 019.

DROP TABLE IF EXISTS scorecard_indicators;
