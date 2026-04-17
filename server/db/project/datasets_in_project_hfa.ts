import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { assertNotUndefined } from "@timroberton/panther";
import { Sql } from "postgres";
import {
  _SANDBOX_DIR_PATH,
  _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
} from "../../exposed_env_vars.ts";
import {
  APIResponseWithData,
  DatasetHfaInfoInProject,
  getEnabledOptionalFacilityColumns,
  hashFacilityColumnsConfig,
  throwIfErrNoData,
  throwIfErrWithData,
  type HfaIndicator,
  type HfaIndicatorCode,
} from "lib";
import {
  getFacilityColumnsConfig,
  getMaxAdminAreaConfig,
} from "../instance/config.ts";
import { computeHfaCacheHash } from "../instance/dataset_hfa.ts";
import {
  DBHfaIndicator,
  dbRowToHfaIndicator,
} from "../instance/hfa_indicators.ts";
import { getHfaIndicatorsVersion } from "../instance/instance.ts";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { removeDatasetFromProject } from "./datasets_in_project_hmis.ts";

export async function addDatasetHfaToProject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  onProgress?: (progress: number, message: string) => Promise<void>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    if (onProgress) await onProgress(0.1, "Removing existing dataset...");
    const res = await removeDatasetFromProject(projectDb, projectId, "hfa");
    throwIfErrNoData(res);

    if (onProgress) await onProgress(0.2, "Validating configuration...");
    const hasData = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM dataset_hfa LIMIT 1`)[0].count > 0;
    if (!hasData) {
      throw new Error("No HFA data available to add to project");
    }

    // Get facility columns configuration
    const facilityColumnsRes = await getFacilityColumnsConfig(mainDb);
    if (!facilityColumnsRes.success) {
      return facilityColumnsRes;
    }
    const facilityConfig = facilityColumnsRes.data;

    // Get max admin area configuration
    const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
    throwIfErrWithData(resMaxAdminArea);

    const datasetDirPath = getDatasetDirPath(projectId);
    await ensureDir(datasetDirPath);
    await Deno.chmod(datasetDirPath, 0o777);

    const datasetFilePathForPostgres = getDatasetFilePathForPostgres(
      projectId,
      "hfa",
    );

    if (onProgress) await onProgress(0.5, "Exporting HFA data to CSV...");

    // Build admin area columns list based on config
    const adminAreaColumns = [];
    for (let i = 1; i <= Math.min(resMaxAdminArea.data.maxAdminArea, 4); i++) {
      adminAreaColumns.push(`admin_area_${i}`);
    }

    // Build optional facility columns array
    const optionalColumns = getEnabledOptionalFacilityColumns(facilityConfig);

    // Export dataset_hfa with facility details including optional columns
    const exportStatement = `
SELECT
  h.facility_id,
  ${adminAreaColumns.map((col) => `f.${col}`).join(",\n  ")}${
      optionalColumns.length > 0
        ? `,\n  ${optionalColumns.map((col) => `f.${col}`).join(",\n  ")}`
        : ""
    },
  h.time_point,
  h.var_name,
  h.value
FROM dataset_hfa h
INNER JOIN facilities f ON h.facility_id = f.facility_id`;

    // Use COPY with optimized settings for better performance
    await mainDb.unsafe(`
COPY (${exportStatement}) TO '${datasetFilePathForPostgres}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);

    if (onProgress) await onProgress(0.8, "Updating project database...");
    const lastUpdated = new Date().toISOString();

    // Fetch HFA indicator definitions + per-time-point R code from the instance
    // DB for the project-level snapshot. The module runner reads from the
    // snapshot so indicators and data stay in sync for this project.
    const hfaIndicatorRowsForSnapshot = await mainDb<DBHfaIndicator[]>`
      SELECT * FROM hfa_indicators ORDER BY sort_order, var_name
    `;
    const hfaIndicatorCodeRowsForSnapshot = await mainDb<
      {
        var_name: string;
        time_point: string;
        r_code: string;
        r_filter_code: string | null;
      }[]
    >`
      SELECT var_name, time_point, r_code, r_filter_code
      FROM hfa_indicator_code
      ORDER BY var_name, time_point
    `;

    // Staleness metadata — stored in datasets.info so the client can detect
    // when the project's export is behind the instance.
    const hfaTimePointRowsForHash = await mainDb<
      { time_point: string; date_imported: string | null }[]
    >`
      SELECT time_point, date_imported
      FROM dataset_hfa_dictionary_time_points
      ORDER BY time_point
    `;
    const hfaCacheHash = computeHfaCacheHash(hfaTimePointRowsForHash);
    const hfaIndicatorsVersion = await getHfaIndicatorsVersion(mainDb);
    const structureLastUpdatedRow = (
      await mainDb<{ config_json_value: string }[]>`
        SELECT config_json_value
        FROM instance_config
        WHERE config_key = 'structure_last_updated'
      `
    ).at(0);
    const structureLastUpdated = structureLastUpdatedRow
      ? JSON.parse(structureLastUpdatedRow.config_json_value)
      : undefined;
    const info: DatasetHfaInfoInProject = {
      hfaCacheHash,
      hfaIndicatorsVersion,
      structureLastUpdated,
      facilityColumnsHash: hashFacilityColumnsConfig(facilityConfig),
    };

    // Fetch facilities from main database to populate project database
    const facilities = (await mainDb.unsafe(
      `SELECT * FROM facilities`,
    )) as Array<{
      facility_id: string;
      admin_area_4: string;
      admin_area_3: string;
      admin_area_2: string;
      admin_area_1: string;
      facility_name: string | null;
      facility_type: string | null;
      facility_ownership: string | null;
      facility_custom_1: string | null;
      facility_custom_2: string | null;
      facility_custom_3: string | null;
      facility_custom_4: string | null;
      facility_custom_5: string | null;
    }>;

    // Fetch unique HFA indicators (var_name) from main database with sample values
    const hfaIndicators = (await mainDb.unsafe(`
      WITH distinct_values AS (
        SELECT
          var_name,
          value,
          ROW_NUMBER() OVER (PARTITION BY var_name ORDER BY value) as rn
        FROM (
          SELECT DISTINCT var_name, value
          FROM dataset_hfa
          WHERE value IS NOT NULL AND value != ''
        ) AS dv
      )
      SELECT
        var_name,
        STRING_AGG(value, ', ' ORDER BY value) as sample_values
      FROM distinct_values
      WHERE rn <= 20
      GROUP BY var_name
      ORDER BY var_name
    `)) as Array<{ var_name: string; sample_values: string | null }>;

    // Clear existing data and populate with HFA data. Snapshot-code rows FK
    // into snapshot-indicator rows, so the DELETE order matters (code first).
    await projectDb.begin((sql) => [
      sql`
INSERT INTO datasets (dataset_type, info, last_updated)
VALUES (
  'hfa',
  ${JSON.stringify(info)},
  ${lastUpdated}
)
ON CONFLICT (dataset_type) DO UPDATE SET
  info = EXCLUDED.info,
  last_updated = EXCLUDED.last_updated
`,
      sql`DELETE FROM hfa_indicator_code_snapshot`,
      sql`DELETE FROM hfa_indicators_snapshot`,
      sql`DELETE FROM facilities`,
      sql`DELETE FROM indicators_hfa`,
      ...(facilities.length > 0
        ? [
          sql.unsafe(`
        INSERT INTO facilities (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1, facility_name, facility_type, facility_ownership, facility_custom_1, facility_custom_2, facility_custom_3, facility_custom_4, facility_custom_5)
        VALUES ${
            facilities
              .map(
                (fac) =>
                  `('${fac.facility_id}', '${fac.admin_area_4}', '${fac.admin_area_3}', '${fac.admin_area_2}', '${fac.admin_area_1}', ${
                    fac.facility_name ? `'${fac.facility_name}'` : "NULL"
                  }, ${
                    fac.facility_type ? `'${fac.facility_type}'` : "NULL"
                  }, ${
                    fac.facility_ownership
                      ? `'${fac.facility_ownership}'`
                      : "NULL"
                  }, ${
                    fac.facility_custom_1
                      ? `'${fac.facility_custom_1}'`
                      : "NULL"
                  }, ${
                    fac.facility_custom_2
                      ? `'${fac.facility_custom_2}'`
                      : "NULL"
                  }, ${
                    fac.facility_custom_3
                      ? `'${fac.facility_custom_3}'`
                      : "NULL"
                  }, ${
                    fac.facility_custom_4
                      ? `'${fac.facility_custom_4}'`
                      : "NULL"
                  }, ${
                    fac.facility_custom_5
                      ? `'${fac.facility_custom_5}'`
                      : "NULL"
                  })`,
              )
              .join(",\n")
          }
      `),
        ]
        : []),
      ...(hfaIndicators.length > 0
        ? [
          sql.unsafe(`
        INSERT INTO indicators_hfa (var_name, example_values)
        VALUES ${
            hfaIndicators
              .map((ind) => `('${ind.var_name}', '${ind.sample_values || ""}')`)
              .join(",\n")
          }
      `),
        ]
        : []),
      ...hfaIndicatorRowsForSnapshot.map(
        (ind) =>
          sql`INSERT INTO hfa_indicators_snapshot
            (var_name, category, definition, type, aggregation, sort_order)
            VALUES (${ind.var_name}, ${ind.category}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${ind.sort_order})`,
      ),
      ...hfaIndicatorCodeRowsForSnapshot.map(
        (c) =>
          sql`INSERT INTO hfa_indicator_code_snapshot
            (var_name, time_point, r_code, r_filter_code)
            VALUES (${c.var_name}, ${c.time_point}, ${c.r_code}, ${c.r_filter_code})`,
      ),
    ]);

    return { success: true, data: { lastUpdated } };
  });
}

// ============================================================================
// Snapshot readers (consumed by run_module_iterator + script preview)
// ============================================================================

type DBHfaIndicatorCodeSnapshot = {
  var_name: string;
  time_point: string;
  r_code: string;
  r_filter_code: string | null;
};

export async function getAllHfaIndicatorsFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicator[]> {
  const rows = await projectDb<DBHfaIndicator[]>`
    SELECT
      var_name,
      category,
      definition,
      type,
      aggregation,
      sort_order,
      '' as updated_at
    FROM hfa_indicators_snapshot
    ORDER BY sort_order, var_name
  `;
  return rows.map(dbRowToHfaIndicator);
}

export async function getAllHfaIndicatorCodeFromSnapshot(
  projectDb: Sql,
): Promise<HfaIndicatorCode[]> {
  const rows = await projectDb<DBHfaIndicatorCodeSnapshot[]>`
    SELECT var_name, time_point, r_code, r_filter_code
    FROM hfa_indicator_code_snapshot
    ORDER BY var_name, time_point
  `;
  return rows.map((r) => ({
    varName: r.var_name,
    timePoint: r.time_point,
    rCode: r.r_code,
    rFilterCode: r.r_filter_code ?? undefined,
  }));
}

function getDatasetDirPath(projectId: string): string {
  return join(_SANDBOX_DIR_PATH, projectId, "datasets");
}

function getDatasetFilePathForPostgres(
  projectId: string,
  datasetType: string,
): string {
  return join(
    _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
    projectId,
    "datasets",
    `${datasetType}.csv`,
  );
}
