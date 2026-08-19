import { Sql } from "postgres";
import {
  APIResponseNoData,
  APIResponseWithData,
  FacilityFamily,
  InstanceConfigAdminAreaLabels,
  instanceConfigAdminAreaLabelsSchema,
  RunGenerationDefaults,
  runGenerationDefaultsSchema,
  StructureSchema,
  structureSchemaSchema,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

// One advisory lock shared by the two write paths that race on a family's
// depth-vs-maps consistency: setStructureSchema's depth change and the geojson
// map saves (saveGeoJsonMap / dhis2SaveGeoJsonMap). Both check-then-write
// inside a transaction, so without the lock a depth lowering and a map save
// above the new depth can interleave.
export const STRUCTURE_GEOJSON_ADVISORY_LOCK_KEY = 727401;

function structureSchemaConfigKey(family: FacilityFamily): string {
  return `structure_schema_${family}`;
}

export async function getStructureSchema(
  mainDb: Sql,
  family: FacilityFamily
): Promise<APIResponseWithData<StructureSchema>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value
      FROM instance_config
      WHERE config_key = ${structureSchemaConfigKey(family)}
    `;

    if (result.length === 0) {
      return {
        success: false,
        err: `${structureSchemaConfigKey(family)} config not found`,
      };
    }

    const config = structureSchemaSchema.parse(
      JSON.parse(result[0].config_json_value),
    );

    return {
      success: true,
      data: config,
    };
  });
}

// The 3-way family selection used by query context / availability (ruling 4):
// hmis → HMIS schema, hfa → HFA schema, iceh/undefined → undefined (no
// enabled facility columns; iceh_data has no facility dimension, so that
// branch is defensive, not live).
export async function getStructureSchemaForDatasetFamily(
  mainDb: Sql,
  family: string | undefined
): Promise<StructureSchema | undefined> {
  if (family !== "hmis" && family !== "hfa") {
    return undefined;
  }
  const res = await getStructureSchema(mainDb, family);
  if (res.success === false) {
    throw new Error(res.err);
  }
  return res.data;
}

export async function setStructureSchema(
  mainDb: Sql,
  family: FacilityFamily,
  schema: StructureSchema
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const validated = structureSchemaSchema.parse(schema);
    const configKey = structureSchemaConfigKey(family);

    // Guard checks and the config write share one transaction so a concurrent
    // structure import can't land rows between check and write.
    return await mainDb.begin(async (sql): Promise<APIResponseNoData> => {
      const currentRows = await sql<{ config_json_value: string }[]>`
        SELECT config_json_value FROM instance_config
        WHERE config_key = ${configKey}
      `;
      const current = currentRows.length > 0
        ? structureSchemaSchema.parse(JSON.parse(currentRows[0].config_json_value))
        : null;

      if (current !== null && current.adminDepth !== validated.adminDepth) {
        await sql`SELECT pg_advisory_xact_lock(${STRUCTURE_GEOJSON_ADVISORY_LOCK_KEY})`;

        const facilitiesTable = family === "hmis"
          ? "facilities_hmis"
          : "facilities_hfa";
        const facilitiesCount = await sql<{ count: number }[]>`
          SELECT COUNT(*) as count FROM ${sql(facilitiesTable)}
        `;
        if (facilitiesCount[0].count > 0) {
          return {
            success: false,
            err: `Cannot change the ${family.toUpperCase()} admin depth: the ${family.toUpperCase()} facility registry contains data`,
          };
        }

        const geojsonLevels = await sql<{ admin_area_level: number }[]>`
          SELECT admin_area_level FROM geojson_maps
          WHERE facility_family = ${family}
            AND admin_area_level > ${validated.adminDepth}
          ORDER BY admin_area_level
        `;
        if (geojsonLevels.length > 0) {
          const levels = geojsonLevels.map((r) => r.admin_area_level).join(", ");
          return {
            success: false,
            err: `Cannot lower the ${family.toUpperCase()} admin depth: GeoJSON boundaries exist above the new level. Delete the level-${levels} boundaries first.`,
          };
        }
      }

      await sql`
        INSERT INTO instance_config (config_key, config_json_value)
        VALUES (${configKey}, ${JSON.stringify(validated)})
        ON CONFLICT (config_key)
        DO UPDATE SET config_json_value = ${JSON.stringify(validated)}
      `;

      return { success: true };
    });
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

// The instance's AI context (D15): free prose an admin writes on the settings
// page, prepended to the copilot's system prompt. ONE instance-level string,
// stored like every other instance_config row: a plain string JSON-encoded
// into config_json_value.
// Absent = empty, never an error: a missing context must not break the prompt.
export async function getAiContextConfig(
  mainDb: Sql
): Promise<APIResponseWithData<string>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value
      FROM instance_config
      WHERE config_key = 'ai_context'
    `;

    if (result.length === 0) {
      return { success: true, data: "" };
    }

    return { success: true, data: String(JSON.parse(result[0].config_json_value)) };
  });
}

export async function updateAiContextConfig(
  mainDb: Sql,
  aiContext: string
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const value = JSON.stringify(aiContext);
    await mainDb`
      INSERT INTO instance_config (config_key, config_json_value)
      VALUES ('ai_context', ${value})
      ON CONFLICT (config_key)
      DO UPDATE SET config_json_value = ${value}
    `;

    return { success: true };
  });
}

// The results-package wizard's instance defaults (PLAN_RESULTS_RUNS Phase 3
// item 1, §3.5): the starting values an admin saved in the module-defaults
// editor (S8). Absent — or stored under a shape an older build wrote —
// degrades to "no defaults", which is exactly the empty wizard, so a bad
// blob can never block generation.
const EMPTY_RUN_GENERATION_DEFAULTS: RunGenerationDefaults = {
  step1: null,
  moduleIds: [],
  parameterSelections: {},
};

export async function getRunGenerationDefaultsConfig(
  mainDb: Sql
): Promise<APIResponseWithData<RunGenerationDefaults>> {
  return await tryCatchDatabaseAsync(async () => {
    const result = await mainDb<{ config_json_value: string }[]>`
      SELECT config_json_value
      FROM instance_config
      WHERE config_key = 'run_generation_defaults'
    `;

    if (result.length === 0) {
      return { success: true, data: EMPTY_RUN_GENERATION_DEFAULTS };
    }

    const parsed = runGenerationDefaultsSchema.safeParse(
      JSON.parse(result[0].config_json_value),
    );
    if (parsed.success === false) {
      console.error(
        `[run_generation] stored instance defaults do not parse — starting from scratch: ${parsed.error.message}`,
      );
      return { success: true, data: EMPTY_RUN_GENERATION_DEFAULTS };
    }

    return { success: true, data: parsed.data };
  });
}

export async function updateRunGenerationDefaultsConfig(
  mainDb: Sql,
  config: RunGenerationDefaults
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const validated = runGenerationDefaultsSchema.parse(config);
    await mainDb`
      INSERT INTO instance_config (config_key, config_json_value)
      VALUES ('run_generation_defaults', ${JSON.stringify(validated)})
      ON CONFLICT (config_key)
      DO UPDATE SET config_json_value = ${JSON.stringify(validated)}
    `;

    return { success: true };
  });
}
