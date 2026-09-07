-- The population level is an explicit instance_config setting
-- (population_level): every stored row is at it, and it must be set before
-- the first import. Rows written before the setting existed were never
-- checked against one level, so they go; the store is re-imported.
DELETE FROM population;
