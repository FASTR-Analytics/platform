import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  InstanceConfigAdminAreaLabels,
  InstanceConfigMaxAdminArea,
  InstanceConfigFacilityColumns,
  InstanceConfigCountryIso3,
  instanceConfigAdminAreaLabelsSchema,
  instanceConfigCountryIso3Schema,
  instanceConfigFacilityColumnsSchema,
  instanceConfigMaxAdminAreaSchema,
  throwIfErrWithData,
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

    // Emptiness checks and the config write share one transaction so a
    // concurrent structure import can't land rows between check and write.
    return await mainDb.begin(async (sql): Promise<APIResponseNoData> => {
      const facilitiesCount = await sql<{ count: number }[]>`
        SELECT
          (SELECT COUNT(*) FROM facilities_hmis) +
          (SELECT COUNT(*) FROM facilities_hfa) as count
      `;

      if (facilitiesCount[0].count > 0) {
        return {
          success: false,
          err: "Cannot change maxAdminArea: facilities table contains data",
        };
      }

      for (let i = 1; i <= 4; i++) {
        const tableName = `admin_areas_${i}`;
        const result = await sql<{ count: number }[]>`
          SELECT COUNT(*) as count FROM ${sql(tableName)}
        `;

        if (result[0].count > 0) {
          return {
            success: false,
            err: `Cannot change maxAdminArea: ${tableName} table contains data`,
          };
        }
      }

      // Check no geojson boundaries exist above the new max level
      const geojsonLevels = await sql<{ admin_area_level: number }[]>`
        SELECT admin_area_level FROM geojson_maps
        WHERE admin_area_level > ${newMaxAdminArea}
        ORDER BY admin_area_level
      `;
      if (geojsonLevels.length > 0) {
        const levels = geojsonLevels.map((r) => r.admin_area_level).join(", ");
        return {
          success: false,
          err: `Cannot lower maxAdminArea: GeoJSON boundaries exist above the new level. Delete the level-${levels} boundaries first.`,
        };
      }

      const configValue: InstanceConfigMaxAdminArea = {
        maxAdminArea: newMaxAdminArea,
      };
      const validated = instanceConfigMaxAdminAreaSchema.parse(configValue);

      await sql`
        UPDATE instance_config
        SET config_json_value = ${JSON.stringify(validated)}
        WHERE config_key = 'max_admin_area'
      `;

      return {
        success: true,
      };
    });
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

    const config = instanceConfigMaxAdminAreaSchema.parse(
      JSON.parse(result[0].config_json_value),
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

    const config = instanceConfigFacilityColumnsSchema.parse(
      JSON.parse(result[0].config_json_value),
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
    const validated = instanceConfigFacilityColumnsSchema.parse(config);
    await mainDb`
      INSERT INTO instance_config (config_key, config_json_value)
      VALUES ('facility_columns', ${JSON.stringify(validated)})
      ON CONFLICT (config_key)
      DO UPDATE SET config_json_value = ${JSON.stringify(validated)}
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

    const config = instanceConfigCountryIso3Schema.parse(
      JSON.parse(result[0].config_json_value),
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
    // Interpolated into generated R scripts as "${countryIso3}" — must be a clean token
    const normalized = (countryIso3 ?? "").trim().toUpperCase();
    if (normalized !== "" && !/^[A-Z]{3}$/.test(normalized)) {
      return {
        success: false,
        err: "Country code must be exactly 3 letters (ISO3), e.g. KEN.",
      };
    }
    const configValue: InstanceConfigCountryIso3 = {
      countryIso3: normalized === "" ? undefined : normalized,
    };
    const validated = instanceConfigCountryIso3Schema.parse(configValue);

    await mainDb`
      INSERT INTO instance_config (config_key, config_json_value)
      VALUES ('country_iso3', ${JSON.stringify(validated)})
      ON CONFLICT (config_key)
      DO UPDATE SET config_json_value = ${JSON.stringify(validated)}
    `;

    return { success: true };
  });
}

export async function getAdminAreaLabelsConfig(
  mainDb: Sql
): Promise<APIResponseWithData<InstanceConfigAdminAreaLabels>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value
      FROM instance_config
      WHERE config_key = 'admin_area_labels'
    `;

    if (result.length === 0) {
      return { success: true, data: {} };
    }

    const config = instanceConfigAdminAreaLabelsSchema.parse(
      JSON.parse(result[0].config_json_value),
    );

    return { success: true, data: config };
  });
}

export async function updateAdminAreaLabelsConfig(
  mainDb: Sql,
  config: InstanceConfigAdminAreaLabels
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const validated = instanceConfigAdminAreaLabelsSchema.parse(config);
    await mainDb`
      INSERT INTO instance_config (config_key, config_json_value)
      VALUES ('admin_area_labels', ${JSON.stringify(validated)})
      ON CONFLICT (config_key)
      DO UPDATE SET config_json_value = ${JSON.stringify(validated)}
    `;

    return { success: true };
  });
}
