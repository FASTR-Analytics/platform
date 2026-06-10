-- Delete the single-visualization share feature (see PLAN_DELETE_VIZ_SHARE.md).
-- share_tokens is viz-only and effectively unused; the table + all tokens are dropped.
-- 026_share_tokens.sql still owns the CREATE TABLE, so the base schema simply no longer
-- mirrors it; this forward drop removes it from existing instances (and from the
-- validate_migrations fresh replay, where 026 recreates then 044 drops → net no table).
DROP TABLE IF EXISTS share_tokens CASCADE;
