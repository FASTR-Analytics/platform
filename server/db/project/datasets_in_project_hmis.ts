import { ensureDir } from "@std/fs";
import { dirname } from "@std/path";
import { assertNotUndefined } from "@timroberton/panther";
import { Sql } from "postgres";
import {
  APIResponseWithData,
  CommonIndicatorCatalogError,
  type CommonIndicatorCatalogRow,
  getEnabledOptionalFacilityColumns,
  StructureSchema,
  isValidPeriodId,
  resolveCommonIndicatorCatalog,
  throwIfErrWithData,
  type DatasetHmisInfoInProject,
} from "lib";
import { getCommonIndicators } from "../instance/indicators.ts";
import { getPopulationTypes } from "../instance/population.ts";
import {
  getStructureSchema,
} from "../instance/config.ts";
import { getCurrentDatasetHmisVersion } from "../instance/dataset_hmis.ts";
import { assertNoRunningDatasetHmisImportRun } from "../instance/dataset_hmis_import_runs.ts";
import {
  getBaseIndicatorMappingsVersion,
  getIndicatorMappingsVersion,
} from "../instance/instance.ts";
import { tryCatchDatabaseAsync } from "./../utils.ts";

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

// computeDatasetHmisRunCapture does every instance-DB read, validation, and
// the COPY TO export — and returns the captured rows the caller needs (run
// input mirrors, script-generation inputs, manifest datasets info) WITHOUT
// touching any project DB. Capture is always the FULL dataset — entire
// period range, all indicators, all admin areas, all facility
// types/ownerships (PLAN_FULL_CAPTURE_GENERATION ruling 2026-08-03):
// the R scripts need the full dataset to compute correctly, and per-project
// subsetting is an attach-time query filter, never a generation input.

// The facilities_{hmis,hfa} column set, in project-table order — the run's
// facilities parquet is built from these rows directly (no project table to
// export from under the no-dual-write model).
export const PROJECT_FACILITY_COLUMN_NAMES = [
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

export type ProjectFacilityRow = {
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
  info: DatasetHmisInfoInProject;
  lastUpdated: string;
  // The v2 `indicators.json` mirror: the WHOLE common dictionary, resolved.
  // (v1 carried only the commons that had mappings, and a separate calculated
  // snapshot beside it.)
  indicators: CommonIndicatorCatalogRow[];
  facilities: ProjectFacilityRow[];
  // The extract's month range and the structure's finest admin level — what
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
    // one would copy torn mid-run data into the project stamped with the
    // settled version id. Refuse up front (this also gives the clear error
    // on a first-ever import, when the only version row is still hidden).
    // A run *launching* mid-export remains possible — that window existed
    // pre-Phase-3 too (a CSV integrate commit could land mid-export) and
    // self-signals via the staleness marker at run end.
    await assertNoRunningDatasetHmisImportRun(mainDb);

    // Validate BEFORE removing the existing attachment — a validation
    // failure after the remove would leave the project detached with
    // modules still clean and clients unnotified. The version is also the
    // staleness marker, so it must be captured before the export.
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

    const exportStatement = getDatasetHmisExportStatement(
      resStructureSchema.data
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
    const baseIndicatorMappingsVersion =
      await getBaseIndicatorMappingsVersion(mainDb);

    const info: DatasetHmisInfoInProject = {
      version,
      totalRows,
      structureLastUpdated,
      indicatorMappingsVersion,
      baseIndicatorMappingsVersion,
    };

    if (onProgress) await onProgress(0.5, "Exporting data to CSV...");
    // Use COPY with optimized settings for better performance
    await mainDb.unsafe(`
COPY (${exportStatement}) TO '${csvTarget.postgresPath}' WITH (FORMAT CSV, HEADER true, FREEZE false)
`);

    // The mirror carries the WHOLE dictionary — a derived indicator's own row
    // is what makes the package standalone. The extract, by contrast, is base
    // rows only, so the base commons with mappings are exactly the ingredients
    // any expression may draw on.
    const commonIndicators = await getCommonIndicators(mainDb);
    const baseIdsInData = new Set(
      (
        await mainDb<{ indicator_common_id: string }[]>`
          SELECT DISTINCT i.indicator_common_id
          FROM indicators i
          INNER JOIN indicator_mappings im
            ON im.indicator_common_id = i.indicator_common_id
          WHERE i.definition_type = 'base'
        `
      ).map((r) => r.indicator_common_id),
    );

    let indicators: CommonIndicatorCatalogRow[];
    try {
      indicators = resolveCommonIndicatorCatalog(
        commonIndicators,
        baseIdsInData,
        (await getPopulationTypes(mainDb)).map((t) => t.id),
      );
    } catch (e) {
      if (!(e instanceof CommonIndicatorCatalogError)) throw e;
      return {
        success: false,
        err:
          `Cannot generate results from this dictionary. The following indicators cannot be computed:\n\n${
            e.problems.join("\n")
          }\n\nEdit or remove these indicators, or ensure your data includes the indicators they are computed from.`,
      };
    }

    const facilities = (await mainDb.unsafe(
      `SELECT ${PROJECT_FACILITY_COLUMN_NAMES.join(", ")} FROM facilities_hmis`,
    )) as ProjectFacilityRow[];

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

function getDatasetHmisExportStatement(
  structureSchema: StructureSchema
): string {
  // Admin columns up to the HMIS registry's own depth — never a global max
  const adminAreaColumns = [];
  for (let i = 1; i <= structureSchema.adminDepth; i++) {
    adminAreaColumns.push(`admin_area_${i}`);
  }

  // Add enabled optional columns
  const optionalColumns = getEnabledOptionalFacilityColumns(structureSchema);

  // Use CTEs for clarity - explicitly showing the aggregation from raw to common IDs
  const statement = `
WITH aggregated AS (
  -- Step 1: Aggregate raw indicators to common IDs. BASE commons only —
  -- everything else is a formula over these, computed downstream.
  SELECT
    d.facility_id,
    im.indicator_common_id,
    d.period_id,
    SUM(d.count) as count
  FROM dataset_hmis d
  INNER JOIN indicator_mappings im ON d.indicator_raw_id = im.indicator_raw_id
  INNER JOIN indicators i
    ON i.indicator_common_id = im.indicator_common_id
   AND i.definition_type = 'base'
  GROUP BY
    d.facility_id,
    im.indicator_common_id,
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
