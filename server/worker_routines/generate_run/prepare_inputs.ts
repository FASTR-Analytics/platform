import { join } from "@std/path";
import type { Sql } from "postgres";
import {
  throwIfErrWithData,
  type CalculatedIndicator,
  type DatasetType,
  type HfaIndicator,
  type HfaIndicatorCode,
  type HfaIndicatorVariantCode,
  type RunDataset,
  type RunGenerationStep1Result,
} from "lib";
import {
  calculatedIndicatorToSnapshotRow,
  computeDatasetHfaRunCapture,
  computeDatasetHmisRunCapture,
  computeDatasetIcehRunCapture,
  dbRowToHfaIndicator,
  PROJECT_FACILITY_COLUMN_NAMES,
  type DatasetCsvTarget,
  type ProjectFacilityRow,
} from "../../db/mod.ts";
import { _RUNS_DIR_PATH_POSTGRES_INTERNAL } from "../../exposed_env_vars.ts";
import {
  exportRowsToParquet,
  readCsvHeaders,
  runInputFilePath,
  runTmpDirPath,
  type ExportedColumn,
} from "../../runs/mod.ts";
import { writeParquetFromCsv } from "../../run_query/mod.ts";
import { sha256HexOfFile } from "./input_key.ts";
import type { HfaSentinelRow } from "../../server_only_funcs/get_script_with_parameters_hfa.ts";

// Stage 1 of the run pipeline — prepare inputs (PLAN_RESULTS_RUNS item 2;
// COPY TO re-targeted by item 7, binding decision 4; project-DB writes
// deleted by the Phase 3 re-cut, ruling 5). The dataset CAPTURE functions do
// every instance-DB read plus the `COPY … TO` that writes each extract
// DIRECTLY into the run's inputs/datasets/ (the Postgres container writes
// through the runs volume via the _POSTGRES_INTERNAL namespace). Nothing is
// written to any project database: the captured rows become this run's own
// input mirrors (JSON + facilities parquet) and its manifest datasets info,
// and they feed script generation. A family not selected in step 1 simply
// has no extract and no manifest entry.

export type PreparedRunInputs = {
  selectedFamilies: DatasetType[];
  // sha256 of each extract CSV, by family — module inputKey ingredients.
  datasetExtractHashes: Map<DatasetType, string>;
  // Relative paths (from the run dir root) for the manifest's inputFiles.
  extraInputFiles: string[];
  // Manifest `datasets` entries, built from the captures (the project
  // `datasets` table is never written or read on this path).
  datasets: RunDataset[];
  // Facilities tables captured into the run, with their parquet columns.
  facilitiesTables: { tableName: string; columns: ExportedColumn[] }[];
  // Everything script generation needs (previously re-read from the project
  // snapshot tables the dual-write had just populated).
  scriptInputs: {
    knownDatasetVariables: Set<string>;
    hfaIndicators: HfaIndicator[];
    hfaIndicatorCode: HfaIndicatorCode[];
    // R code is generation-input only, never a package input file (the
    // executed script is already captured as ___script___.R). Group
    // assignments ride hfaIndicators' variantGroupId.
    hfaVariantCode: HfaIndicatorVariantCode[];
    hfaSentinelRows: HfaSentinelRow[];
    calculatedIndicators: CalculatedIndicator[];
  };
};

// The project facilities tables are all-text; the run parquet declares the
// same (§2.3 declared types, never inferred).
const FACILITY_PARQUET_COLUMNS: ExportedColumn[] =
  PROJECT_FACILITY_COLUMN_NAMES.map((name) => ({
    name,
    duckDbType: "VARCHAR",
  }));

export async function prepareRunInputs(
  mainDb: Sql,
  step1: RunGenerationStep1Result,
  runId: string,
): Promise<PreparedRunInputs> {
  const tmpDir = runTmpDirPath(runId);
  await Deno.mkdir(join(tmpDir, "inputs", "datasets"), { recursive: true });
  await Deno.mkdir(join(tmpDir, "outputs"), { recursive: true });

  const runCsvTarget = (datasetType: DatasetType): DatasetCsvTarget => ({
    postgresPath: join(
      _RUNS_DIR_PATH_POSTGRES_INTERNAL,
      `.tmp-${runId}`,
      "inputs",
      "datasets",
      `${datasetType}.csv`,
    ),
    denoPath: join(tmpDir, "inputs", "datasets", `${datasetType}.csv`),
  });

  const selectedFamilies: DatasetType[] = [];
  const datasets: RunDataset[] = [];
  const extraInputFiles: string[] = [];
  const facilitiesTables: { tableName: string; columns: ExportedColumn[] }[] =
    [];
  const scriptInputs: PreparedRunInputs["scriptInputs"] = {
    knownDatasetVariables: new Set<string>(),
    hfaIndicators: [],
    hfaIndicatorCode: [],
    hfaVariantCode: [],
    hfaSentinelRows: [],
    calculatedIndicators: [],
  };

  if (step1.hmis) {
    selectedFamilies.push("hmis");
    const res = await computeDatasetHmisRunCapture(
      mainDb,
      runCsvTarget("hmis"),
    );
    throwIfErrWithData(res);
    const capture = res.data;
    datasets.push({
      datasetType: "hmis",
      lastUpdated: capture.lastUpdated,
      info: capture.info,
    });
    await writeInputJson(tmpDir, "indicators.json", capture.indicators);
    extraInputFiles.push("inputs/indicators.json");
    await writeInputJson(
      tmpDir,
      "calculated_indicators_snapshot.json",
      capture.calculatedIndicators.map(calculatedIndicatorToSnapshotRow),
    );
    extraInputFiles.push("inputs/calculated_indicators_snapshot.json");
    await writeFacilitiesParquet(tmpDir, "facilities_hmis", capture.facilities);
    extraInputFiles.push("inputs/facilities_hmis.parquet");
    facilitiesTables.push({
      tableName: "facilities_hmis",
      columns: FACILITY_PARQUET_COLUMNS,
    });
    scriptInputs.calculatedIndicators = capture.calculatedIndicators;
  }

  if (step1.hfa) {
    selectedFamilies.push("hfa");
    const res = await computeDatasetHfaRunCapture(
      mainDb,
      runCsvTarget("hfa"),
    );
    throwIfErrWithData(res);
    const capture = res.data;
    datasets.push({
      datasetType: "hfa",
      lastUpdated: capture.lastUpdated,
      info: capture.info,
    });
    await writeInputJson(
      tmpDir,
      "hfa_indicators_snapshot.json",
      capture.indicators,
    );
    extraInputFiles.push("inputs/hfa_indicators_snapshot.json");
    for (
      const [fileName, rows] of [
        ["hfa_indicator_categories_snapshot.json", capture.categories],
        ["hfa_indicator_sub_categories_snapshot.json", capture.subCategories],
        [
          "hfa_indicator_service_categories_snapshot.json",
          capture.serviceCategories,
        ],
        ["hfa_indicator_variant_groups_snapshot.json", capture.variantGroups],
        ["hfa_indicator_variant_items_snapshot.json", capture.variantItems],
      ] as const
    ) {
      await writeInputJson(tmpDir, fileName, rows);
      extraInputFiles.push(`inputs/${fileName}`);
    }
    await writeFacilitiesParquet(tmpDir, "facilities_hfa", capture.facilities);
    extraInputFiles.push("inputs/facilities_hfa.parquet");
    facilitiesTables.push({
      tableName: "facilities_hfa",
      columns: FACILITY_PARQUET_COLUMNS,
    });
    scriptInputs.knownDatasetVariables = new Set(
      capture.indicatorsHfa.map((r) => r.var_name),
    );
    // Script generation consumed these through the project snapshot reader,
    // which ordered by category → sub-category → indicator sort order. The
    // order reaches the generated R script (hence the module inputKey), so
    // it is reproduced here rather than inherited from the instance query.
    const categoryOrder = new Map(
      capture.categories.map((c) => [c.id, c.sort_order]),
    );
    const subCategoryOrder = new Map(
      capture.subCategories.map((s) => [s.id, s.sort_order]),
    );
    scriptInputs.hfaIndicators = capture.indicators
      .toSorted(
        (a, b) =>
          (categoryOrder.get(a.category_id ?? "") ?? 999999) -
            (categoryOrder.get(b.category_id ?? "") ?? 999999) ||
          (subCategoryOrder.get(a.sub_category_id ?? "") ?? 999999) -
            (subCategoryOrder.get(b.sub_category_id ?? "") ?? 999999) ||
          a.sort_order - b.sort_order ||
          a.var_name.localeCompare(b.var_name),
      )
      .map(dbRowToHfaIndicator);
    scriptInputs.hfaIndicatorCode = capture.indicatorCode.map((c) => ({
      varName: c.var_name,
      timePoint: c.time_point,
      rCode: c.r_code,
      rFilterCode: c.r_filter_code ?? undefined,
    }));
    scriptInputs.hfaVariantCode = capture.variantCode.map((c) => ({
      varName: c.var_name,
      timePoint: c.time_point,
      itemId: c.item_id,
      rCode: c.r_code,
    }));
    scriptInputs.hfaSentinelRows = capture.sentinelValues.map((r) => ({
      varName: r.var_name,
      value: r.value,
      sentinelClass: r.sentinel_class,
      isNumeric: r.is_numeric,
    }));
  }

  if (step1.iceh) {
    selectedFamilies.push("iceh");
    const res = await computeDatasetIcehRunCapture(mainDb, runCsvTarget("iceh"));
    throwIfErrWithData(res);
    const capture = res.data;
    datasets.push({
      datasetType: "iceh",
      lastUpdated: capture.lastUpdated,
      info: capture.info,
    });
    await writeInputJson(
      tmpDir,
      "iceh_indicators_snapshot.json",
      capture.indicators,
    );
    extraInputFiles.push("inputs/iceh_indicators_snapshot.json");
  }

  const datasetExtractHashes = new Map<DatasetType, string>();
  for (const datasetType of selectedFamilies) {
    const csvPath = runCsvTarget(datasetType).denoPath;
    const headers = await readCsvHeaders(csvPath);
    await writeParquetFromCsv({
      csvPath,
      parquetPath: join(tmpDir, "inputs", "datasets", `${datasetType}.parquet`),
      columns: headers.map((name) => ({
        name,
        duckDbType: extractColumnType(datasetType, name),
      })),
      // Postgres COPY TO CSV writes NULL as unquoted-empty and quotes real
      // empty strings; writeParquetFromCsv never nulls quoted values.
      nullStrings: [""],
    });
    datasetExtractHashes.set(datasetType, await sha256HexOfFile(csvPath));
    extraInputFiles.push(
      `inputs/datasets/${datasetType}.csv`,
      `inputs/datasets/${datasetType}.parquet`,
    );
  }

  return {
    selectedFamilies,
    datasetExtractHashes,
    extraInputFiles,
    datasets,
    facilitiesTables,
    scriptInputs,
  };
}

async function writeInputJson(
  tmpDir: string,
  fileName: string,
  rows: unknown[],
): Promise<void> {
  await Deno.writeTextFile(
    runInputFilePath(tmpDir, fileName),
    JSON.stringify(rows),
  );
}

async function writeFacilitiesParquet(
  tmpDir: string,
  tableName: string,
  facilities: ProjectFacilityRow[],
): Promise<void> {
  await exportRowsToParquet(
    facilities as unknown as Record<string, unknown>[],
    FACILITY_PARQUET_COLUMNS,
    runInputFilePath(tmpDir, `${tableName}.parquet`),
  );
}

// Explicit parquet schema for the extract twins (§2.3: declared types, never
// inferred — facility ids and HFA values are TEXT that inference would
// mangle). Mirrors the Postgres types of the export statements'
// columns: everything is an identifier/label except the few numeric columns
// named here.
function extractColumnType(datasetType: DatasetType, column: string): string {
  if (datasetType === "hmis") {
    if (column === "period_id" || column === "count") return "BIGINT";
    return "VARCHAR";
  }
  if (datasetType === "hfa") {
    if (column === "weight") return "DOUBLE";
    return "VARCHAR";
  }
  if (column === "year" || column === "sample_size") return "BIGINT";
  if (column === "estimate" || column === "standard_error") return "DOUBLE";
  return "VARCHAR";
}
