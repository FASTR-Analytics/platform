-- countryIso3 moved from an instance setting to the ISO_COUNTRY_CODE env var,
-- passed by the server-cli Docker run system. The stored row is now dead: every
-- reader takes _INSTANCE_COUNTRY_ISO3 and the settings-page editor is gone.
DELETE FROM instance_config WHERE config_key = 'country_iso3';
