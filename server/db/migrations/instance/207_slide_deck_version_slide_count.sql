-- A deck version's slide count, shown on each row of the version history.
-- It was counted from the stored slides text on every listing. It is now
-- written with the version. 208_slide_count_backfill.ts fills it for the
-- versions that exist, and 209_slide_count_not_null.sql makes it required.

ALTER TABLE slide_deck_versions ADD COLUMN IF NOT EXISTS slide_count integer;
