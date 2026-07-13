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
  parseAa3CompositeKey,
  throwIfErrNoData,
  throwIfErrWithData,
  type DatasetHmisInfoInProject,
  type DatasetType,
} from "lib";
import { DBIndicator } from "../instance/_main_database_types.ts";
import { getCalculatedIndicators } from "../instance/calculated_indicators.ts";
import {
  getFacilityColumnsConfig,
  getMaxAdminAreaConfig,
} from "../instance/config.ts";
import { getCurrentDatasetHmisVersion } from "../instance/dataset_hmis.ts";
import {
  getCalculatedIndicatorsVersion,
  getIndicatorMappingsVersion,
} from "../instance/instance.ts";
import { escapeSqlString, tryCatchDatabaseAsync } from "./../utils.ts";

export async function addDatasetHmisToProject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  windowing: DatasetHmisWindowingCommon | undefined,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    // Validate BEFORE removing the existing attachment — a validation
    // failure after the remove would leave the project detached with
    // modules still clean and clients unnotified. The version is also the
    // staleness marker, so it must be captured before the export.
    if (onProgress) await onProgress(0.1, "Validating configuration...");
    const version = await getCurrentDatasetHmisVersion(mainDb);
    assertNotUndefined(version, "Cannot get hmis version");

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

    if (onProgress) await onProgress(0.2, "Removing existing dataset...");
    const res = await removeDatasetFromProject(projectDb, projectId, "hmis");
    throwIfErrNoData(res);

    const datasetDirPath = getDatasetDirPath(projectId);
    await ensureDir(datasetDirPath);
    await Deno.chmod(datasetDirPath, 0o777);

    const datasetFilePathForPostgres = getDatasetFilePathForPostgres(
      projectId,
      "hmis"
    );

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

    const calculatedIndicatorsVersion =
      await getCalculatedIndicatorsVersion(mainDb);
    const resCalculatedIndicators = await getCalculatedIndicators(mainDb);
    throwIfErrWithData(resCalculatedIndicators);
    const calculatedIndicators = resCalculatedIndicators.data;

    const info: DatasetHmisInfoInProject = {
      version,
      windowing: startingWindowing,
      totalRows,
      structureLastUpdated,
      indicatorMappingsVersion,
      facilityColumnsConfig: resFacilityConfig.data,
      maxAdminArea: resMaxAdminArea.data.maxAdminArea,
      calculatedIndicatorsVersion,
    };

    if (onProgress) await onProgress(0.5, "Exporting data to CSV...");
    // Use COPY with optimized settings for better performance
    await mainDb.unsafe(`
COPY (${exportStatement}) TO '${datasetFilePathForPostgres}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);
    const indicators = await mainDb<DBIndicator[]>`
SELECT i.* FROM indicators i
WHERE EXISTS (
  SELECT 1 FROM indicator_mappings im
  WHERE im.indicator_common_id = i.indicator_common_id
)
    `;

    const indicatorIdsInData = new Set(
      indicators.map((ind) => ind.indicator_common_id)
    );
    const calculatedIndicatorsWithMissingData: string[] = [];
    for (const ci of calculatedIndicators) {
      if (!indicatorIdsInData.has(ci.num_indicator_id)) {
        calculatedIndicatorsWithMissingData.push(
          `Calculated indicator '${ci.calculated_indicator_id}' requires numerator '${ci.num_indicator_id}' which is not in the data`
        );
      }
      if (
        ci.denom.kind === "indicator" &&
        !indicatorIdsInData.has(ci.denom.indicator_id)
      ) {
        calculatedIndicatorsWithMissingData.push(
          `Calculated indicator '${ci.calculated_indicator_id}' requires denominator '${ci.denom.indicator_id}' which is not in the data`
        );
      }
    }
    if (calculatedIndicatorsWithMissingData.length > 0) {
      return {
        success: false,
        err: `Cannot add data to project. The following calculated indicators reference indicators that don't exist in your data:\n\n${calculatedIndicatorsWithMissingData.join("\n")}\n\nPlease edit or remove these calculated indicators, or ensure your data includes the required indicators.`,
      };
    }

    // Fetch facilities based on the windowing configuration
    let facilitiesQuery = `SELECT * FROM facilities_hmis`;
    const facilityWhereConditions: string[] = [];

    // Filter by admin areas — AA3 takes priority over AA2
    const facAa3Items = startingWindowing.adminArea3sToInclude ?? [];
    if (
      !(startingWindowing.takeAllAdminArea3s ?? true) &&
      facAa3Items.length > 0
    ) {
      const pairs = facAa3Items.map((key) => parseAa3CompositeKey(key));
      facilityWhereConditions.push(
        `(admin_area_3, admin_area_2) IN (VALUES ${pairs
          .map(
            (p) =>
              `('${escapeSqlString(p.aa3)}', '${escapeSqlString(p.aa2)}')`
          )
          .join(", ")})`
      );
    } else if (
      !startingWindowing.takeAllAdminArea2s &&
      startingWindowing.adminArea2sToInclude.length > 0
    ) {
      facilityWhereConditions.push(
        `admin_area_2 IN (${startingWindowing.adminArea2sToInclude
          .map((aa) => `'${escapeSqlString(aa)}'`)
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
          .map((fo) => `'${escapeSqlString(fo)}'`)
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
          .map((ft) => `'${escapeSqlString(ft)}'`)
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
ON CONFLICT (dataset_type) DO UPDATE SET
  info = EXCLUDED.info,
  last_updated = EXCLUDED.last_updated
`,
      sql`DELETE FROM indicators`,
      sql`DELETE FROM facilities_hmis`,
      sql`DELETE FROM calculated_indicators_snapshot`,
      ...indicators.map(
        (ind) =>
          sql`INSERT INTO indicators (indicator_common_id, indicator_common_label)
        VALUES (${ind.indicator_common_id}, ${ind.indicator_common_label})`
      ),
      ...(facilities.length > 0
        ? facilities.map(
            (fac) =>
              sql`INSERT INTO facilities_hmis (facility_id, admin_area_4, admin_area_3, admin_area_2, admin_area_1, facility_name, facility_type, facility_ownership, facility_custom_1, facility_custom_2, facility_custom_3, facility_custom_4, facility_custom_5)
        VALUES (${fac.facility_id}, ${fac.admin_area_4}, ${fac.admin_area_3}, ${fac.admin_area_2}, ${fac.admin_area_1}, ${fac.facility_name}, ${fac.facility_type}, ${fac.facility_ownership}, ${fac.facility_custom_1}, ${fac.facility_custom_2}, ${fac.facility_custom_3}, ${fac.facility_custom_4}, ${fac.facility_custom_5})`
          )
        : []),
      ...calculatedIndicators.map(
        (ci) =>
          sql`INSERT INTO calculated_indicators_snapshot (
            calculated_indicator_id, label, group_label, sort_order,
            num_indicator_id, denom_kind, denom_indicator_id, denom_population_type, denom_population_multiplier,
            format_as, threshold_direction, threshold_green, threshold_yellow
          ) VALUES (
            ${ci.calculated_indicator_id}, ${ci.label}, ${ci.group_label}, ${ci.sort_order},
            ${ci.num_indicator_id}, ${ci.denom.kind},
            ${ci.denom.kind === "indicator" ? ci.denom.indicator_id : null},
            ${ci.denom.kind === "population" ? ci.denom.population_type : null},
            ${ci.denom.kind === "population" ? ci.denom.multiplier : null},
            ${ci.format_as}, ${ci.threshold_direction},
            ${ci.threshold_green}, ${ci.threshold_yellow}
          )`
      ),
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
    // Fully clear the per-dataset-type tables so "disable" actually disables.
    // The code order matters for HFA: snapshot-code FKs into snapshot-indicators.
    await projectDb.begin((sql) => [
      sql`DELETE FROM datasets WHERE dataset_type = ${datasetType}`,
      ...(datasetType === "hmis"
        ? [
            sql`DELETE FROM indicators`,
            sql`DELETE FROM facilities_hmis`,
            sql`DELETE FROM calculated_indicators_snapshot`,
          ]
        : datasetType === "hfa"
          ? [
              sql`DELETE FROM hfa_indicator_code_snapshot`,
              sql`DELETE FROM hfa_indicators_snapshot`,
              sql`DELETE FROM hfa_indicator_sub_categories_snapshot`,
              sql`DELETE FROM hfa_indicator_categories_snapshot`,
              sql`DELETE FROM hfa_indicator_service_categories_snapshot`,
              sql`DELETE FROM indicators_hfa`,
              sql`DELETE FROM facilities_hfa`,
            ]
          : datasetType === "iceh"
            ? [sql`DELETE FROM iceh_indicators_snapshot`]
            : []),
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

  // Add admin area filter — AA3 takes priority over AA2
  const aa3Items = w.adminArea3sToInclude ?? [];
  if (!(w.takeAllAdminArea3s ?? true) && aa3Items.length > 0) {
    const pairs = aa3Items.map((key) => parseAa3CompositeKey(key));
    whereConditions.push(
      `(f.admin_area_3, f.admin_area_2) IN (VALUES ${pairs
        .map(
          (p) =>
            `('${escapeSqlString(p.aa3)}', '${escapeSqlString(p.aa2)}')`
        )
        .join(", ")})`
    );
  } else if (!w.takeAllAdminArea2s && w.adminArea2sToInclude.length > 0) {
    whereConditions.push(
      `f.admin_area_2 IN (${w.adminArea2sToInclude
        .map((aa) => `'${escapeSqlString(aa)}'`)
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
        .map((fo) => `'${escapeSqlString(fo)}'`)
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
        .map((ft) => `'${escapeSqlString(ft)}'`)
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
    .map((ite) => `'${escapeSqlString(ite)}'`)
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
  aggregated.indicator_common_id,
  aggregated.count
FROM aggregated
INNER JOIN facilities_hmis f ON aggregated.facility_id = f.facility_id${
    whereConditions.length > 0
      ? `
WHERE ${whereConditions.join(" AND ")}`
      : ""
  }
-- Deterministic row order (the GROUP BY key, so a total order): the extract's
-- bytes are a module inputKey ingredient (PLAN_RESULTS_RUNS §3.7), and
-- parallel hash aggregation makes unordered COPY output vary run to run.
ORDER BY aggregated.facility_id, aggregated.indicator_common_id, aggregated.period_id
`;

  return statement;
}
