import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import { assertNotUndefined } from "@timroberton/panther";
import { Sql } from "postgres";
import {
  _SANDBOX_DIR_PATH,
  _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
} from "../../exposed_env_vars.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  DatasetHmisWindowingCommon,
  getEnabledOptionalFacilityColumns,
  InstanceConfigFacilityColumns,
  isValidPeriodId,
  throwIfErrNoData,
  throwIfErrWithData,
  type DatasetHmisInfoInProject,
  type DatasetType,
} from "lib";
import { DBIndicator } from "../instance/_main_database_types.ts";
import {
  getFacilityColumnsConfig,
  getMaxAdminAreaConfig,
} from "../instance/config.ts";
import { getCurrentDatasetHmisVersion } from "../instance/dataset_hmis.ts";
import { getIndicatorMappingsVersion } from "../instance/instance.ts";
import { tryCatchDatabaseAsync } from "./../utils.ts";

export async function addDatasetHmisToProject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  windowing: DatasetHmisWindowingCommon | undefined,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    console.log(windowing);

    if (onProgress) await onProgress(0.1, "Removing existing dataset...");
    const res = await removeDatasetFromProject(projectDb, projectId, "hmis");
    throwIfErrNoData(res);

    if (onProgress) await onProgress(0.2, "Validating configuration...");
    const version = await getCurrentDatasetHmisVersion(mainDb);
    assertNotUndefined(version, "Cannot get hmis version");

    const datasetDirPath = getDatasetDirPath(projectId);
    await ensureDir(datasetDirPath);
    await Deno.chmod(datasetDirPath, 0o777);

    const datasetFilePathForPostgres = getDatasetFilePathForPostgres(
      projectId,
      "hmis"
    );

    // const facilitiesLinkingLevel = await getStructureLevel(
    //   mainDb,
    //   "facilities"
    // );
    // assertNotUndefined(facilitiesLinkingLevel, "Bad facilities linking level");
    const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
    throwIfErrWithData(resMaxAdminArea);

    const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
    throwIfErrWithData(resFacilityConfig);

    // Get actual min/max periods from the entire dataset table
    const datasetTableName = "dataset_hmis";
    const periodRange = await mainDb<
      { min_period: number; max_period: number }[]
    >`
      SELECT 
        MIN(period_id) as min_period, 
        MAX(period_id) as max_period 
      FROM ${mainDb(datasetTableName)}
    `;

    const minPeriod = periodRange[0]?.min_period;
    const maxPeriod = periodRange[0]?.max_period;

    // Validate that we have period data
    if (!minPeriod || !maxPeriod) {
      throw new Error(
        `No data found in dataset hmis. The dataset table is empty or has no valid periods.`
      );
    }

    // Validate period format
    if (!isValidPeriodId(String(minPeriod))) {
      throw new Error(
        `Invalid minimum period format: ${minPeriod}. Expected YYYYMM format.`
      );
    }
    if (!isValidPeriodId(String(maxPeriod))) {
      throw new Error(
        `Invalid maximum period format: ${maxPeriod}. Expected YYYYMM format.`
      );
    }

    const startingWindowing: DatasetHmisWindowingCommon = windowing ?? {
      start: minPeriod,
      end: maxPeriod,
      takeAllIndicators: true,
      takeAllAdminArea2s: true,
      commonIndicatorsToInclude: [],
      adminArea2sToInclude: [],
      indicatorType: "common",
    };

    const exportStatement = await getDatasetHmisExportStatement(
      mainDb,
      startingWindowing,
      resFacilityConfig.data
    );

    if (onProgress) await onProgress(0.3, "Counting rows to export...");
    // Count total rows that will be exported
    const rowCountResult = await mainDb<{ count: string }[]>`
      SELECT COUNT(*) as count FROM (${mainDb.unsafe(exportStatement)}) as sq
    `;
    const totalRows = parseInt(rowCountResult[0]?.count || "0");

    // Fetch metadata snapshots for staleness detection
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

    const indicatorMappingsVersion = await getIndicatorMappingsVersion(mainDb);

    const info: DatasetHmisInfoInProject = {
      version,
      windowing: startingWindowing,
      totalRows,
      structureLastUpdated,
      indicatorMappingsVersion,
      facilityColumnsConfig: resFacilityConfig.data,
      maxAdminArea: resMaxAdminArea.data.maxAdminArea,
    };

    if (onProgress) await onProgress(0.5, "Exporting data to CSV...");
    // Use COPY with optimized settings for better performance
    await mainDb.unsafe(`
COPY (${exportStatement}) TO '${datasetFilePathForPostgres}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);
    const indicators = await mainDb<DBIndicator[]>`
SELECT * FROM indicators
    `;

    // Fetch facilities based on the windowing configuration
    let facilitiesQuery = `SELECT * FROM facilities`;
    const facilityWhereConditions: string[] = [];

    // Filter by admin areas if specified
    if (
      !startingWindowing.takeAllAdminArea2s &&
      startingWindowing.adminArea2sToInclude.length > 0
    ) {
      facilityWhereConditions.push(
        `admin_area_2 IN (${startingWindowing.adminArea2sToInclude
          .map((aa) => `'${aa}'`)
          .join(", ")})`
      );
    }

    // Filter by facility ownership if specified and enabled
    if (
      resFacilityConfig.data.includeOwnership &&
      !startingWindowing.takeAllFacilityOwnerships &&
      startingWindowing.facilityOwnwershipsToInclude &&
      startingWindowing.facilityOwnwershipsToInclude.length > 0
    ) {
      facilityWhereConditions.push(
        `facility_ownership IN (${startingWindowing.facilityOwnwershipsToInclude
          .map((fo) => `'${fo}'`)
          .join(", ")})`
      );
    }

    // Filter by facility type if specified and enabled
    if (
      resFacilityConfig.data.includeTypes &&
      !startingWindowing.takeAllFacilityTypes &&
      startingWindowing.facilityTypesToInclude &&
      startingWindowing.facilityTypesToInclude.length > 0
    ) {
      facilityWhereConditions.push(
        `facility_type IN (${startingWindowing.facilityTypesToInclude
          .map((ft) => `'${ft}'`)
          .join(", ")})`
      );
    }

    if (facilityWhereConditions.length > 0) {
      facilitiesQuery += ` WHERE ${facilityWhereConditions.join(" AND ")}`;
    }

    const facilities = (await mainDb.unsafe(facilitiesQuery)) as Array<{
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

    if (onProgress) await onProgress(0.8, "Updating project database...");
    const lastUpdated = new Date().toISOString();
    await projectDb.begin((sql) => [
      sql`
INSERT INTO datasets (dataset_type, info, last_updated)
VALUES (
  'hmis',
  ${JSON.stringify(info)},
  ${lastUpdated}
)
`,
      sql`DELETE FROM indicators`,
      sql`DELETE FROM facilities`,
      ...indicators.map(
        (ind) =>
          sql`INSERT INTO indicators (indicator_common_id, indicator_common_label)
        VALUES (${ind.indicator_common_id}, ${ind.indicator_common_label})`
      ),
      ...(facilities.length > 0
        ? facilities.map(
            (fac) =>
              sql`INSERT INTO facilities (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1, facility_name, facility_type, facility_ownership, facility_custom_1, facility_custom_2, facility_custom_3, facility_custom_4, facility_custom_5)
        VALUES (${fac.facility_id}, ${fac.admin_area_4}, ${fac.admin_area_3}, ${fac.admin_area_2}, ${fac.admin_area_1}, ${fac.facility_name}, ${fac.facility_type}, ${fac.facility_ownership}, ${fac.facility_custom_1}, ${fac.facility_custom_2}, ${fac.facility_custom_3}, ${fac.facility_custom_4}, ${fac.facility_custom_5})`
          )
        : []),
    ]);

    return { success: true, data: { lastUpdated } };
  });
}

export async function removeDatasetFromProject(
  projectDb: Sql,
  projectId: string,
  datasetType: DatasetType
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await projectDb.begin((sql) => [
      sql`DELETE FROM datasets WHERE dataset_type = ${datasetType}`,
      // Don't delete indicators/facilities - let them persist until next dataset is added
    ]);
    try {
      const datasetFilePath = getDatasetFilePath(projectId, datasetType);
      await Deno.remove(datasetFilePath);
    } catch {
      //
    }
    return { success: true };
  });
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

function getDatasetDirPath(projectId: string): string {
  return join(_SANDBOX_DIR_PATH, projectId, "datasets");
}

export function getDatasetFilePath(
  projectId: string,
  datasetType: DatasetType
): string {
  return join(_SANDBOX_DIR_PATH, projectId, "datasets", `${datasetType}.csv`);
}

function getDatasetFilePathForPostgres(
  projectId: string,
  datasetType: DatasetType
): string {
  return join(
    _SANDBOX_DIR_PATH_POSTGRES_INTERNAL,
    projectId,
    "datasets",
    `${datasetType}.csv`
  );
}

async function getDatasetHmisExportStatement(
  mainDb: Sql,
  windowing: DatasetHmisWindowingCommon,
  facilityConfig: InstanceConfigFacilityColumns
): Promise<string> {
  const w = windowing;

  // Build WHERE conditions array for better query optimization
  const whereConditions = [];

  // Add admin area filter if specified - apply to facilities table for better performance
  if (!w.takeAllAdminArea2s && w.adminArea2sToInclude.length > 0) {
    whereConditions.push(
      `f.admin_area_2 IN (${w.adminArea2sToInclude
        .map((aa) => `'${aa}'`)
        .join(", ")})`
    );
  }

  // Add facility ownership filter if specified
  if (
    facilityConfig.includeOwnership &&
    !w.takeAllFacilityOwnerships &&
    w.facilityOwnwershipsToInclude &&
    w.facilityOwnwershipsToInclude.length > 0
  ) {
    whereConditions.push(
      `f.facility_ownership IN (${w.facilityOwnwershipsToInclude
        .map((fo) => `'${fo}'`)
        .join(", ")})`
    );
  }

  // Add facility type filter if specified
  if (
    facilityConfig.includeTypes &&
    !w.takeAllFacilityTypes &&
    w.facilityTypesToInclude &&
    w.facilityTypesToInclude.length > 0
  ) {
    whereConditions.push(
      `f.facility_type IN (${w.facilityTypesToInclude
        .map((ft) => `'${ft}'`)
        .join(", ")})`
    );
  }

  // Build admin area columns list (we only have admin_area_1 through admin_area_4)
  const maxAdminAreaRes = await getMaxAdminAreaConfig(mainDb);
  throwIfErrWithData(maxAdminAreaRes);
  const adminAreaColumns = [];
  for (let i = 1; i <= Math.min(maxAdminAreaRes.data.maxAdminArea, 4); i++) {
    adminAreaColumns.push(`admin_area_${i}`);
  }

  // Add enabled optional columns
  const optionalColumns = getEnabledOptionalFacilityColumns(facilityConfig);

  // Use CTEs for clarity - explicitly showing the aggregation from raw to common IDs
  const statement = `
WITH raw_data AS (
  -- Step 1: Get raw indicator data from dataset_hmis
  SELECT 
    facility_id,
    indicator_raw_id,
    period_id,
    count
  FROM dataset_hmis
  WHERE period_id >= ${w.start} 
    AND period_id <= ${w.end}
),
aggregated AS (
  -- Step 2: Aggregate raw indicators to common IDs and filter on common indicators
  SELECT 
    raw_data.facility_id,
    im.indicator_common_id,
    raw_data.period_id,
    SUM(raw_data.count) as count
  FROM raw_data
  INNER JOIN indicator_mappings im ON raw_data.indicator_raw_id = im.indicator_raw_id${
    !w.takeAllIndicators && w.commonIndicatorsToInclude.length > 0
      ? `
  WHERE im.indicator_common_id IN (${w.commonIndicatorsToInclude
    .map((ite) => `'${ite}'`)
    .join(", ")})`
      : ""
  }
  GROUP BY 
    raw_data.facility_id,
    im.indicator_common_id,
    raw_data.period_id
)
-- Step 3: Final output with facility and period details
SELECT 
  aggregated.facility_id,
  ${adminAreaColumns.map((col) => `f.${col}`).join(", ")}${
    optionalColumns.length > 0
      ? `,\n  ${optionalColumns.map((col) => `f.${col}`).join(", ")}`
      : ""
  },
  aggregated.period_id,
  (aggregated.period_id / 100)::text as year,
  LPAD((aggregated.period_id % 100)::text, 2, '0') as month,
  CASE 
    WHEN aggregated.period_id % 100 <= 3 THEN (aggregated.period_id / 100) * 10 + 1
    WHEN aggregated.period_id % 100 <= 6 THEN (aggregated.period_id / 100) * 10 + 2
    WHEN aggregated.period_id % 100 <= 9 THEN (aggregated.period_id / 100) * 10 + 3
    ELSE (aggregated.period_id / 100) * 10 + 4
  END as quarter_id,
  aggregated.indicator_common_id,
  aggregated.count
FROM aggregated
INNER JOIN facilities f ON aggregated.facility_id = f.facility_id${
    whereConditions.length > 0
      ? `
WHERE ${whereConditions.join(" AND ")}`
      : ""
  }
`;

  return statement;
}
