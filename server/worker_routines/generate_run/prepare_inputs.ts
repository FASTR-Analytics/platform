import { join } from "@std/path";
import type { Sql } from "postgres";
import {
  ADMIN_AREA_COLUMNS,
  listMonthlyPeriodIds,
  personYearsForMonth,
  populationAreaKey,
  populationCellCoverage,
  populationTypesReferencedByCatalog,
  throwIfErrWithData,
  type CommonIndicatorCatalogRow,
  type DatasetType,
  type HfaIndicator,
  type HfaIndicatorCode,
  type HfaIndicatorVariantCode,
  type RunManifestDataset,
  type RunGenerationStep1Result,
  type RunPopulation,
  type RunPopulationCoverage,
} from "lib";
import {
  dbRowToHfaIndicator,
  getPopulationAnchors,
  getPopulationLevel,
  listHmisStructureAreas,
} from "../../db/mod.ts";
import { computeDatasetHfaRunCapture } from "../../runs/capture_inputs/hfa.ts";
import {
  computeDatasetHmisRunCapture,
  RUN_FACILITY_COLUMN_NAMES,
  type DatasetCsvTarget,
  type RunFacilityRow,
} from "../../runs/capture_inputs/hmis.ts";
import { computeDatasetIcehRunCapture } from "../../runs/capture_inputs/iceh.ts";
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

// Stage 1 of the run pipeline: prepare inputs (PLAN_RESULTS_RUNS item 2;
// COPY TO re-targeted by item 7, binding decision 4; project-DB writes
// deleted by the Phase 3 re-cut, ruling 5). The dataset CAPTURE functions do
// every instance-DB read plus the `COPY … TO` that writes each extract
// DIRECTLY into the run's inputs/datasets/ (the Postgres container writes
// through the runs volume via the _POSTGRES_INTERNAL namespace). Nothing is
// written to any project database: the captured rows become this run's own
// input mirrors (JSON + facilities parquet) and its manifest datasets info,
// and they feed script generation. A family not selected in step 1 simply
// has no extract and no manifest entry.

// The content hashes of the run's prepared input files: module inputKey
// ingredients (resolve_reuse.ts), one per declared data source kind.
export type RunInputHashes = {
  // sha256 of each extract CSV, by family.
  datasets: Map<DatasetType, string>;
  // sha256 of inputs/population.csv; null when the run has no HMIS family
  // (the file is written on every HMIS capture, header-only if nothing
  // needs it).
  population: string | null;
};

export type PreparedRunInputs = {
  selectedFamilies: DatasetType[];
  inputHashes: RunInputHashes;
  // The manifest's `population` stamp (PLAN_1b ruling 4).
  population: RunPopulation | null;
  // Relative paths (from the run dir root) for the manifest's inputFiles.
  extraInputFiles: string[];
  // Manifest `datasets` entries, built from the captures (the project
  // `datasets` table is never written or read on this path).
  datasets: RunManifestDataset[];
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
    // The resolved common-indicator catalog, from the HMIS capture. m012's
    // ingredient table is built from it and substituted into its script
    // (PLAN_1a §1.5); empty when the run carries no HMIS family.
    commonIndicatorCatalog: CommonIndicatorCatalogRow[];
  };
};

// The project facilities tables are all-text; the run parquet declares the
// same (§2.3 declared types, never inferred).
const FACILITY_PARQUET_COLUMNS: ExportedColumn[] =
  RUN_FACILITY_COLUMN_NAMES.map((name) => ({
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
  const datasets: RunManifestDataset[] = [];
  const extraInputFiles: string[] = [];
  let population: RunPopulation | null = null;
  let populationHash: string | null = null;
  const facilitiesTables: { tableName: string; columns: ExportedColumn[] }[] =
    [];
  const scriptInputs: PreparedRunInputs["scriptInputs"] = {
    knownDatasetVariables: new Set<string>(),
    hfaIndicators: [],
    hfaIndicatorCode: [],
    hfaVariantCode: [],
    hfaSentinelRows: [],
    commonIndicatorCatalog: [],
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
    // The v2 indicators mirror: the WHOLE common dictionary, resolved
    // (PLAN_1a §1.10). The separate calculated_indicators_snapshot.json that
    // used to sit beside it is gone: one writer, one catalog contract.
    await writeInputJson(tmpDir, "indicators.json", capture.indicators);
    extraInputFiles.push("inputs/indicators.json");
    // The resolved catalog is also a SCRIPT-GENERATION input: m012's
    // ingredient table is substituted into its script as a data literal
    // (PLAN_1a §1.5), so nothing is written to inputs/ for it and no
    // memoization input class exists: the literal rides in scriptText.
    scriptInputs.commonIndicatorCatalog = capture.indicators;
    await writeFacilitiesParquet(tmpDir, "facilities_hmis", capture.facilities);
    extraInputFiles.push("inputs/facilities_hmis.parquet");
    facilitiesTables.push({
      tableName: "facilities_hmis",
      columns: FACILITY_PARQUET_COLUMNS,
    });
    // The person-years file, written on EVERY HMIS capture so a module
    // declaring the population source always has its input; header-only when
    // no expression in the catalog names a population.
    population = await writePopulationPersonYears(mainDb, tmpDir, capture);
    populationHash = await sha256HexOfFile(
      runInputFilePath(tmpDir, POPULATION_FILE_NAME),
    );
    extraInputFiles.push(`inputs/${POPULATION_FILE_NAME}`);
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
    inputHashes: { datasets: datasetExtractHashes, population: populationHash },
    population,
    extraInputFiles,
    datasets,
    facilitiesTables,
    scriptInputs,
  };
}

export const POPULATION_FILE_NAME = "population.csv";

// Annual population stock → monthly person-years, for every population type
// the resolved catalog's slot maps reference (the expression IS the
// declaration), over the extract's months (SYSTEM_08 "population.csv").
// Format, permanent once written: admin_area_2..N, period_id,
// population_type, person_years. The header alone sets m012's grain.
//
// Population is ACTIVE when at least one type is referenced. Not active: the
// file is header-only at the HMIS depth and m012 keeps the data exactly as it
// is. Active: the file is at the population level, HMIS finer than that is
// summed up by m012, and each type gets person-years for exactly the cells
// (area × month) its anchors cover; m012 drops the other cells for the
// indicators naming that type, and the stamp records what was covered. Only
// three things refuse the run: no population level and a referenced type with
// no rows for any structure area at that level, both of which the indicator
// manager already shows as "Population data missing", and a population level
// deeper than the HMIS structure.
async function writePopulationPersonYears(
  mainDb: Sql,
  tmpDir: string,
  capture: {
    indicators: CommonIndicatorCatalogRow[];
    periodRange: { min: number; max: number };
    adminDepth: number;
  },
): Promise<RunPopulation> {
  const populationTypes = populationTypesReferencedByCatalog(capture.indicators);
  const extractMonths = {
    firstPeriodId: capture.periodRange.min,
    lastPeriodId: capture.periodRange.max,
  };
  const writeFile = (level: number, rows: string[]) =>
    Deno.writeTextFile(
      runInputFilePath(tmpDir, POPULATION_FILE_NAME),
      [
        [
          ...ADMIN_AREA_COLUMNS.slice(1, level),
          "period_id",
          "population_type",
          "person_years",
        ].join(","),
        ...rows,
      ].join("\n") + "\n",
    );

  if (populationTypes.length === 0) {
    await writeFile(capture.adminDepth, []);
    return {
      active: false,
      adminAreaLevel: capture.adminDepth,
      populationTypes: [],
      coverage: [],
      ...extractMonths,
    };
  }

  const level = await getPopulationLevel(mainDb);
  if (level === undefined) {
    throw new Error(
      "Cannot generate results: an indicator formula uses a population, but the population level is not set. Set it on the instance Population page and import population data before generating.",
    );
  }
  if (level > capture.adminDepth) {
    throw new Error(
      capture.adminDepth < 2
        ? `Cannot generate results: an indicator formula uses a population, but the HMIS structure has no admin areas below the country, so population rates cannot be computed. Remove the population term from the formula or import a structure with admin areas.`
        : `Cannot generate results: the population data is at admin area level ${level}, deeper than the HMIS structure (level ${capture.adminDepth}). Delete the population data on the instance Population page and re-import it at level ${capture.adminDepth} or a coarser one.`,
    );
  }
  const areas = await listHmisStructureAreas(mainDb, level);
  const periodIds = listMonthlyPeriodIds(
    capture.periodRange.min,
    capture.periodRange.max,
  );
  const rows: string[] = [];
  const coverage: RunPopulationCoverage[] = [];
  for (const populationType of populationTypes) {
    const anchorsByArea = await getPopulationAnchors(
      mainDb,
      populationType,
      level,
    );
    let areasWithData = 0;
    let areasCovered = 0;
    let firstCoveredPeriodId: number | null = null;
    let lastCoveredPeriodId: number | null = null;
    for (const area of areas) {
      const names = [
        area.admin_area_1,
        area.admin_area_2,
        area.admin_area_3,
        area.admin_area_4,
      ];
      const anchors = anchorsByArea.get(populationAreaKey(names));
      if (anchors === undefined) continue;
      areasWithData++;
      const cells = populationCellCoverage(anchors, periodIds);
      if (cells.length === 0) continue;
      areasCovered++;
      firstCoveredPeriodId = Math.min(firstCoveredPeriodId ?? Infinity, cells[0]);
      lastCoveredPeriodId = Math.max(
        lastCoveredPeriodId ?? -Infinity,
        cells[cells.length - 1],
      );
      for (const periodId of cells) {
        rows.push(
          [
            ...names.slice(1, level).map(csvCell),
            String(periodId),
            csvCell(populationType),
            String(
              personYearsForMonth(
                anchors,
                Math.floor(periodId / 100),
                periodId % 100,
              ),
            ),
          ].join(","),
        );
      }
    }
    if (areasWithData === 0) {
      throw new Error(
        `Cannot generate results: an indicator formula uses the population "${populationType}", but the population store holds no data for it for any area of the current HMIS structure at admin area level ${level}. Import it on the instance Population page.`,
      );
    }
    coverage.push({
      populationType,
      areasCovered,
      areasTotal: areas.length,
      firstCoveredPeriodId,
      lastCoveredPeriodId,
    });
  }

  await writeFile(level, rows);
  return {
    active: true,
    adminAreaLevel: level,
    populationTypes,
    coverage,
    ...extractMonths,
  };
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
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
  facilities: RunFacilityRow[],
): Promise<void> {
  await exportRowsToParquet(
    facilities as unknown as Record<string, unknown>[],
    FACILITY_PARQUET_COLUMNS,
    runInputFilePath(tmpDir, `${tableName}.parquet`),
  );
}

// Explicit parquet schema for the extract twins (§2.3: declared types, never
// inferred: facility ids and HFA values are TEXT that inference would
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
