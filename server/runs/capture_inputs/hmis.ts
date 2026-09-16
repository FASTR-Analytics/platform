import { ensureDir } from "@std/fs";
import { dirname } from "@std/path";
import { assertNotUndefined } from "@timroberton/panther";
import { Sql } from "postgres";
import {
  analysedIdsWithData,
  analysedIndicatorIds,
  APIResponseWithData,
  hasRows,
  type HmisIndicator,
  HmisIndicatorCatalogError,
  type HmisIndicatorCatalogRow,
  getEnabledOptionalFacilityColumns,
  StructureSchema,
  isValidPeriodId,
  resolveHmisIndicatorCatalog,
  throwIfErrWithData,
  type RunDatasetHmisInfo,
  POPULATION_TYPE_IDS,
} from "lib";
import { getHmisIndicators } from "../../db/instance/indicators.ts";
import {
  getStructureSchema,
} from "../../db/instance/config.ts";
import { getCurrentDatasetHmisVersion } from "../../db/instance/dataset_hmis.ts";
import { assertNoRunningDatasetHmisImportRun } from "../../db/instance/dataset_hmis_import_runs.ts";
import {
  getCountIndicatorsVersion,
  getIndicatorsVersion,
} from "../../db/instance/instance.ts";
import { escapeSqlString, tryCatchDatabaseAsync } from "../../db/utils.ts";

// Where a dataset capture writes its extract CSV: the Postgres server executes
// `COPY … TO postgresPath` (a path inside the Postgres container), and
// denoPath is the SAME file as this process sees it. The two must resolve to
// one file through the container mounts; the run pipeline passes the run tmp
// dir pair.
export type DatasetCsvTarget = {
  postgresPath: string;
  denoPath: string;
};

// Ensures the target's parent dir exists and is writable by the Postgres
// container user before `COPY … TO` runs.
export async function ensureDatasetCsvTargetDir(
  csvTarget: DatasetCsvTarget,
): Promise<void> {
  const dir = dirname(csvTarget.denoPath);
  await ensureDir(dir);
  await Deno.chmod(dir, 0o777);
}

// The run-capture seam (SYSTEM_06): computeDatasetHmisRunCapture does every
// instance-DB read, validation, and the COPY TO export, and returns the
// captured rows the pipeline needs (run input mirrors, script-generation
// inputs, manifest datasets info). Capture is always the FULL dataset:
// entire period range, all indicators, all admin areas, all facility
// types/ownerships (PLAN_FULL_CAPTURE_GENERATION ruling 2026-08-03): the R
// scripts need the full dataset to compute correctly, and subsetting is a
// read-time query filter, never a generation input.

// The facilities_{hmis,hfa} column set: the run's facilities parquet is
// built from these rows directly.
export const RUN_FACILITY_COLUMN_NAMES = [
  "facility_id",
  "admin_area_4",
  "admin_area_3",
  "admin_area_2",
  "admin_area_1",
  "facility_name",
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
] as const;

export type RunFacilityRow = {
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
};

export type DatasetHmisRunCapture = {
  info: RunDatasetHmisInfo;
  lastUpdated: string;
  // The v2 `indicators.json` mirror: the analysed set, resolved
  // (resolveHmisIndicatorCatalog).
  indicators: HmisIndicatorCatalogRow[];
  facilities: RunFacilityRow[];
  // The extract's month range and the structure's finest admin level: what
  // the person-years expansion (prepare_inputs) needs to know which months
  // and which areas every referenced population must cover.
  periodRange: { min: number; max: number };
  adminDepth: number;
};

export async function computeDatasetHmisRunCapture(
  mainDb: Sql,
  csvTarget: DatasetCsvTarget,
  onProgress?: (progress: number, message: string) => Promise<void>
): Promise<APIResponseWithData<DatasetHmisRunCapture>> {
  return await tryCatchDatabaseAsync(async () => {
    // A per-pair DHIS2 run mutates dataset_hmis for hours; exporting during
    // one would copy torn mid-run data into the package stamped with the
    // settled version id. Refuse up front (this also gives the clear error
    // on a first-ever import, when the only version row is still hidden).
    // A run *launching* mid-export remains possible, that window existed
    // pre-Phase-3 too (a CSV integrate commit could land mid-export) and
    // self-signals via the staleness marker at run end.
    await assertNoRunningDatasetHmisImportRun(mainDb);

    // The version is also the staleness marker, so it is captured before
    // the export (a hash-after-export could be taken after a concurrent
    // instance import committed, masking the staleness forever).
    if (onProgress) await onProgress(0.1, "Validating configuration...");
    const version = await getCurrentDatasetHmisVersion(mainDb);
    assertNotUndefined(version, "Cannot get hmis version");

    const resStructureSchema = await getStructureSchema(mainDb, "hmis");
    throwIfErrWithData(resStructureSchema);

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

    await ensureDatasetCsvTargetDir(csvTarget);

    // The analysed set (PLAN_A4 ruling 3) decides what the extract carries;
    // the catalog below is built from the same list and the same set.
    const hmisIndicators = await getHmisIndicators(mainDb);
    const analysed = analysedIndicatorIds(hmisIndicators, POPULATION_TYPE_IDS);

    const exportStatement = getDatasetHmisExportStatement(
      resStructureSchema.data,
      hmisIndicators,
      analysed,
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

    const indicatorsVersion = await getIndicatorsVersion(mainDb);
    const countIndicatorsVersion = await getCountIndicatorsVersion(mainDb);

    const info: RunDatasetHmisInfo = {
      version,
      totalRows,
      structureLastUpdated,
      indicatorsVersion,
      countIndicatorsVersion,
    };

    if (onProgress) await onProgress(0.5, "Exporting data to CSV...");
    // Use COPY with optimized settings for better performance
    await mainDb.unsafe(`
COPY (${exportStatement}) TO '${csvTarget.postgresPath}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);

    // The mirror carries the analysed set: every analysed count, and every
    // calculated with its checkbox on, resolved: a calculated indicator's own row
    // is what makes the package standalone. The extract is the analysed
    // counts, so those with rows (by data id, PLAN_A5 ruling 10) are
    // exactly the ingredients any expression may draw on.
    const dataIdsWithRows = new Set(
      (
        await mainDb<{ data_id: string }[]>`
          SELECT DISTINCT data_id FROM dataset_hmis
        `
      ).map((r) => r.data_id),
    );
    const idsWithData = analysedIdsWithData(
      hmisIndicators,
      analysed,
      dataIdsWithRows,
    );

    let indicators: HmisIndicatorCatalogRow[];
    try {
      indicators = resolveHmisIndicatorCatalog(
        hmisIndicators,
        idsWithData,
        POPULATION_TYPE_IDS,
      );
    } catch (e) {
      if (!(e instanceof HmisIndicatorCatalogError)) throw e;
      return {
        success: false,
        err:
          `Cannot generate results from this dictionary. The following indicators cannot be computed:\n\n${
            e.problems.join("\n")
          }\n\nEdit or remove these indicators, or ensure your data includes the indicators they are computed from.`,
      };
    }

    const facilities = (await mainDb.unsafe(
      `SELECT ${RUN_FACILITY_COLUMN_NAMES.join(", ")} FROM facilities_hmis`,
    )) as RunFacilityRow[];

    return {
      success: true,
      data: {
        info,
        lastUpdated: new Date().toISOString(),
        indicators,
        facilities,
        periodRange: { min: minPeriod, max: maxPeriod },
        adminDepth: resStructureSchema.data.adminDepth,
      },
    };
  });
}

// The extract (PLAN_A4 ruling 4, PLAN_A5 ruling 10): every analysed
// Uploaded or DHIS2 element from the rows under its data id, and every
// analysed sum as SUM(count) over the rows under its members' data ids, per
// facility x month, all emitted under indicator_common_id. Everything else
// is a formula over these, computed downstream.
function getDatasetHmisExportStatement(
  structureSchema: StructureSchema,
  indicators: HmisIndicator[],
  analysed: Set<string>,
): string {
  // Admin columns up to the HMIS registry's own depth: never a global max
  const adminAreaColumns = [];
  for (let i = 1; i <= structureSchema.adminDepth; i++) {
    adminAreaColumns.push(`admin_area_${i}`);
  }

  // Add enabled optional columns
  const optionalColumns = getEnabledOptionalFacilityColumns(structureSchema);

  const sqlList = (ids: string[]) =>
    ids.length === 0
      ? "(SELECT NULL::text WHERE false)"
      : `(VALUES ${ids.map((id) => `('${escapeSqlString(id)}')`).join(", ")})`;
  const analysedWithRows = indicators
    .filter((c) => hasRows(c.definition.type) && analysed.has(c.indicator_common_id))
    .map((c) => c.indicator_common_id);
  const analysedSums = indicators
    .filter((c) => c.definition.type === "sum" && analysed.has(c.indicator_common_id))
    .map((c) => c.indicator_common_id);

  const statement = `
WITH analysed_with_rows(indicator_common_id) AS (
  ${sqlList(analysedWithRows)}
),
analysed_sums(indicator_common_id) AS (
  ${sqlList(analysedSums)}
),
aggregated AS (
  -- Step 1a: every analysed Uploaded or DHIS2 element from the rows under
  -- its data id.
  SELECT
    d.facility_id,
    i.indicator_common_id,
    d.period_id,
    d.count::bigint AS count
  FROM analysed_with_rows a
  INNER JOIN indicators i ON i.indicator_common_id = a.indicator_common_id
  INNER JOIN dataset_hmis d ON d.data_id = i.data_id
  UNION ALL
  -- Step 1b: every analysed sum over the rows under its members' data ids.
  SELECT
    d.facility_id,
    m.sum_id AS indicator_common_id,
    d.period_id,
    SUM(d.count)::bigint AS count
  FROM analysed_sums s
  INNER JOIN indicator_sum_members m ON m.sum_id = s.indicator_common_id
  INNER JOIN indicators mi ON mi.indicator_common_id = m.member_id
  INNER JOIN dataset_hmis d ON d.data_id = mi.data_id
  GROUP BY
    d.facility_id,
    m.sum_id,
    d.period_id
)
-- Step 2: Final output with facility and period details
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
INNER JOIN facilities_hmis f ON aggregated.facility_id = f.facility_id
-- Deterministic row order (the GROUP BY key, so a total order): the extract's
-- bytes are a module inputKey ingredient (PLAN_RESULTS_RUNS §3.7), and
-- parallel hash aggregation makes unordered COPY output vary run to run.
ORDER BY aggregated.facility_id, aggregated.indicator_common_id, aggregated.period_id
`;

  return statement;
}
