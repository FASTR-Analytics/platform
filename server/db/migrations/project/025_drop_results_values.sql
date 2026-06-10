-- results_values was replaced by metrics (006_schema_updates.sql). The data
-- migration to metrics happened long ago; no app code references this table.
-- 002 still creates it on fresh DBs, so drop it here.
DROP TABLE IF EXISTS results_values;
