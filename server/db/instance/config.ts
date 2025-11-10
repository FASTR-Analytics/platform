import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  InstanceConfigMaxAdminArea,
  InstanceConfigFacilityColumns,
  InstanceConfigCountryIso3,
  throwIfErrWithData,
  parseJsonOrThrow,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

export async function updateMaxAdminArea(
  mainDb: Sql,
  newMaxAdminArea: number
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    // Validate the new value is between 1 and 4
    if (newMaxAdminArea < 1 || newMaxAdminArea > 4) {
      return {
        success: false,
        err: "maxAdminArea must be between 1 and 4",
      };
    }

    // Check if any data exists in facilities or admin_areas tables
    const facilitiesCount = await mainDb<{ count: number }[]>`
      SELECT COUNT(*) as count FROM facilities
    `;

    if (facilitiesCount[0].count > 0) {
      return {
        success: false,
        err: "Cannot change maxAdminArea: facilities table contains data",
      };
    }

    // Check all admin_areas tables
    for (let i = 1; i <= 4; i++) {
      const tableName = `admin_areas_${i}`;
      const result = await mainDb<{ count: number }[]>`
        SELECT COUNT(*) as count FROM ${mainDb(tableName)}
      `;

      if (result[0].count > 0) {
        return {
          success: false,
          err: `Cannot change maxAdminArea: ${tableName} table contains data`,
        };
      }
    }

    // Update the config
    const configValue: InstanceConfigMaxAdminArea = {
      maxAdminArea: newMaxAdminArea,
    };

    await mainDb`
      UPDATE instance_config 
      SET config_json_value = ${JSON.stringify(configValue)}
      WHERE config_key = 'max_admin_area'
    `;

    return {
      success: true,
    };
  });
}

// API-facing function that returns wrapped response
export async function getMaxAdminAreaConfig(
  mainDb: Sql
): Promise<APIResponseWithData<{ maxAdminArea: number }>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value 
      FROM instance_config 
      WHERE config_key = 'max_admin_area'
    `;

    if (result.length === 0) {
      return {
        success: false,
        err: "max_admin_area config not found",
      };
    }

    const config = parseJsonOrThrow<InstanceConfigMaxAdminArea>(
      result[0].config_json_value
    );

    return {
      success: true,
      data: { maxAdminArea: config.maxAdminArea },
    };
  });
}

// Helper to get the table name for the max admin area level
export async function getMaxAdminAreaTableName(mainDb: Sql): Promise<string> {
  const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
  throwIfErrWithData(resMaxAdminArea);
  return `admin_areas_${resMaxAdminArea.data.maxAdminArea}`;
}

// Facility columns configuration functions
export async function getFacilityColumnsConfig(
  mainDb: Sql
): Promise<APIResponseWithData<InstanceConfigFacilityColumns>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value 
      FROM instance_config 
      WHERE config_key = 'facility_columns'
    `;

    if (result.length === 0) {
      // Return default config if not found
      return {
        success: true,
        data: {
          includeNames: false,
          includeTypes: false,
          includeOwnership: false,
          includeCustom1: false,
          includeCustom2: false,
          includeCustom3: false,
          includeCustom4: false,
          includeCustom5: false,
        },
      };
    }

    const config = parseJsonOrThrow<InstanceConfigFacilityColumns>(
      result[0].config_json_value
    );

    return {
      success: true,
      data: config,
    };
  });
}

export async function updateFacilityColumnsConfig(
  mainDb: Sql,
  config: InstanceConfigFacilityColumns
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
      INSERT INTO instance_config (config_key, config_json_value)
      VALUES ('facility_columns', ${JSON.stringify(config)})
      ON CONFLICT (config_key)
      DO UPDATE SET config_json_value = ${JSON.stringify(config)}
    `;

    return { success: true };
  });
}

export async function getCountryIso3Config(
  mainDb: Sql
): Promise<APIResponseWithData<InstanceConfigCountryIso3>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value
      FROM instance_config
      WHERE config_key = 'country_iso3'
    `;

    if (result.length === 0) {
      return {
        success: true,
        data: { countryIso3: undefined },
      };
    }

    const config = parseJsonOrThrow<InstanceConfigCountryIso3>(
      result[0].config_json_value
    );

    return {
      success: true,
      data: config,
    };
  });
}

export async function updateCountryIso3Config(
  mainDb: Sql,
  countryIso3: string | undefined
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const configValue: InstanceConfigCountryIso3 = { countryIso3 };

    await mainDb`
      INSERT INTO instance_config (config_key, config_json_value)
      VALUES ('country_iso3', ${JSON.stringify(configValue)})
      ON CONFLICT (config_key)
      DO UPDATE SET config_json_value = ${JSON.stringify(configValue)}
    `;

    return { success: true };
  });
}
