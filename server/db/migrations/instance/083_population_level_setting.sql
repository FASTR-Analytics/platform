-- The population level is an explicit instance_config setting
-- (population_level), no longer inferred from the rows' admin_area_level.
-- Where rows already exist and no setting does, the rows' level (uniform by
-- the previous rule) becomes the setting, so the invariant "every row is at
-- the setting" holds from the first boot.
INSERT INTO instance_config (config_key, config_json_value)
SELECT 'population_level', MIN(admin_area_level)::text
FROM population
HAVING COUNT(*) > 0
ON CONFLICT (config_key) DO NOTHING;
