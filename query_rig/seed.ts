import { join } from "@std/path";
import {
  getDatasetFamily,
  RUN_MANIFEST_SCHEMA_VERSION,
  runManifestSchema,
  type DatasetType,
  type RunFacilitiesTable,
  type RunManifest,
  type RunManifestDataset,
  type RunMetric,
  type RunMetricAvailability,
  type RunModule,
  type RunResultsObject,
  type StructureColumns,
} from "lib";
import {
  computeResultsObjectColumnsToExclude,
  executeSqlOverParquet,
  writeNormalizedResultsObjectParquet,
} from "../server/run_query/mod.ts";
import {
  deriveAvailableDisaggregationOptions,
  exportRowsToParquet,
  runDirPath,
  runInputFilePath,
  runManifestPath,
  runResultsObjectParquetPath,
  type ExportedColumn,
} from "../server/runs/mod.ts";
import { RUN_FACILITY_COLUMN_NAMES } from "../server/runs/capture_inputs/hmis.ts";
import {
  buildRunIndicatorCatalog,
  runDirInputRowsReader,
} from "../server/runs/indicator_catalog.ts";
import type { Fixture, RoColumn } from "./fixtures.ts";

// Fixture → results package. Every file is written by the SAME writer the
// wizard finalize uses — exportRowsToParquet for the facilities twin,
// writeNormalizedResultsObjectParquet for the query parquet (so 'NA' → NULL,
// the declared types and the column exclusions are all under test), and
// buildRunIndicatorCatalog for the stamped indicator catalog. The manifest is
// parsed by runManifestSchema before it is written, so a fixture that drifts
// from the package format fails at seed time rather than pinning a fiction.

const FACILITY_PARQUET_COLUMNS: ExportedColumn[] = RUN_FACILITY_COLUMN_NAMES
  .map((name) => ({ name, duckDbType: "VARCHAR" }));

// Fixed so a package's identity is stable across runs of the rig.
const SEEDED_AT = "2026-01-01T00:00:00.000Z";

export async function seedRunPackage(fx: Fixture): Promise<RunManifest> {
  const runDir = runDirPath(fx.runId);
  await Deno.remove(runDir, { recursive: true }).catch(() => {});
  await Deno.mkdir(join(runDir, "inputs"), { recursive: true });
  await Deno.mkdir(join(runDir, "outputs", fx.moduleId), { recursive: true });

  const moduleDefinition = JSON.stringify(fx.moduleDefinition);
  const family = getDatasetFamily(moduleDefinition);

  const inputFiles: string[] = [];
  const facilitiesTables: RunFacilitiesTable[] = [];
  const datasets: RunManifestDataset[] = [];
  for (const facilities of fx.facilities) {
    const tableName = `facilities_${facilities.family}`;
    await exportRowsToParquet(
      facilities.rows.map((row) =>
        Object.fromEntries(
          RUN_FACILITY_COLUMN_NAMES.map((c) => [c, row[c] ?? null]),
        )
      ),
      FACILITY_PARQUET_COLUMNS,
      runInputFilePath(runDir, `${tableName}.parquet`),
    );
    inputFiles.push(`inputs/${tableName}.parquet`);
    facilitiesTables.push({ tableName, columns: FACILITY_PARQUET_COLUMNS });
    datasets.push({
      datasetType: facilities.family,
      lastUpdated: SEEDED_AT,
      info: {},
    });
  }

  if (fx.hfaSnapshots) {
    const snap = fx.hfaSnapshots;
    for (
      const [fileName, rows] of [
        ["hfa_indicators_snapshot.json", snap.indicators],
        ["hfa_indicator_categories_snapshot.json", snap.categories],
        ["hfa_indicator_sub_categories_snapshot.json", snap.subCategories],
        [
          "hfa_indicator_service_categories_snapshot.json",
          snap.serviceCategories,
        ],
        ["hfa_indicator_variant_groups_snapshot.json", snap.variantGroups],
        ["hfa_indicator_variant_items_snapshot.json", snap.variantItems],
      ] as const
    ) {
      await Deno.writeTextFile(
        runInputFilePath(runDir, fileName),
        JSON.stringify(rows),
      );
      inputFiles.push(`inputs/${fileName}`);
    }
  } else {
    await Deno.writeTextFile(
      runInputFilePath(runDir, "indicators.json"),
      JSON.stringify(fx.indicators ?? []),
    );
    inputFiles.push("inputs/indicators.json");
  }

  const structureColumnsFor = (
    f: DatasetType | undefined,
  ): StructureColumns | undefined =>
    fx.facilities.find((fac) => fac.family === f)?.columns;

  const parquetPath = runResultsObjectParquetPath(
    runDir,
    fx.moduleId,
    fx.resultsObjectId,
  );
  await writeResultsObjectParquet(fx, parquetPath, structureColumnsFor(family));
  const meta = await readParquetQueryMetadata(parquetPath);

  const resultsObject: RunResultsObject = {
    id: fx.resultsObjectId,
    moduleId: fx.moduleId,
    hasParquet: true,
    columns: meta.columns,
    hasFacilityId: meta.columnNames.has("facility_id"),
    physicalTimeColumn: meta.physicalTimeColumn,
    availableDisaggregationOptions: deriveAvailableDisaggregationOptions(
      meta.columnNames,
      structureColumnsFor(family),
    ),
    rowCount: meta.rowCount,
    periodBounds: meta.periodBounds,
  };

  const modules: RunModule[] = [
    {
      id: fx.moduleId,
      moduleDefinition,
      configSelections: null,
      lastRunAt: SEEDED_AT,
      lastRunGitRef: null,
      inputKey: null,
      outputFileHashes: null,
    },
  ];

  const metrics: RunMetric[] = fx.metric
    ? [
      {
        datasetFamily: family ?? null,
        id: fx.metric.id,
        module_id: fx.moduleId,
        label: fx.metric.label,
        variant_label: null,
        value_func: fx.metric.value_func,
        format_as: fx.metric.format_as,
        value_props: JSON.stringify(fx.metric.value_props),
        required_disaggregation_options: JSON.stringify(
          fx.metric.required_disaggregation_options,
        ),
        value_label_replacements: null,
        post_aggregation_expression: null,
        results_object_id: fx.resultsObjectId,
        ai_description: null,
        viz_presets: null,
        hide: false,
        important_notes: null,
      },
    ]
    : [];

  // The rig's metrics are declared available by construction; the availability
  // derivation is finalize's, not the read path's (readers only surface the
  // stamp), so nothing here would be under test.
  const metricAvailability: RunMetricAvailability[] = metrics.map((m) => ({
    metricId: m.id,
    status: "available" as const,
    reason: null,
  }));

  const manifest: RunManifest = {
    manifestSchemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
    runId: fx.runId,
    createdAt: SEEDED_AT,
    label: fx.name,
    provenance: "wizard",
    appVersion: "0.0.0-query-rig",
    rImageTag: null,
    // The base calendar; a case that declares one gets a manifest copy with
    // that value (harness.ts), which is exactly how the read path sees it.
    calendar: "gregorian",
    countryIso3: "KEN",
    structureSchemaHmis: structureColumnsFor("hmis") ?? null,
    structureSchemaHfa: structureColumnsFor("hfa") ?? null,
    datasets,
    facilitiesTables,
    assets: [],
    modules,
    metrics,
    resultsObjects: [resultsObject],
    metricAvailability,
    indicators: await buildRunIndicatorCatalog(
      modules,
      runDirInputRowsReader(runDir, inputFiles),
    ),
    inputFiles,
  };
  runManifestSchema.parse(manifest);
  await Deno.writeTextFile(
    runManifestPath(runDir),
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
}

// The R-output CSV shape the finalize normalizer reads: NULL is the unquoted
// nullstr 'NA', every text value is quoted (so '   ', a tab and '' survive
// verbatim under allow_quoted_nulls=false), numbers are bare.
function toCsv(columns: RoColumn[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => c.name).join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = row[c.name];
          if (v === null || v === undefined) return "NA";
          if (typeof v === "number") return String(v);
          return `"${String(v).replaceAll('"', '""')}"`;
        })
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

async function writeResultsObjectParquet(
  fx: Fixture,
  parquetPath: string,
  facilityColumns: StructureColumns | undefined,
): Promise<void> {
  const csvDir = await Deno.makeTempDir({ prefix: "query_rig_csv_" });
  const csvPath = join(csvDir, `${fx.resultsObjectId}.csv`);
  await Deno.writeTextFile(csvPath, toCsv(fx.roColumns, fx.roRows));
  const csvHeaders = fx.roColumns.map((c) => c.name);
  await writeNormalizedResultsObjectParquet({
    csvPath,
    parquetPath,
    csvHeaders,
    declaredColumns: Object.fromEntries(
      fx.roColumns.map((c) => [c.name, c.declaredType]),
    ),
    columnsToExclude: computeResultsObjectColumnsToExclude(
      csvHeaders,
      facilityColumns,
    ),
  });
  await Deno.remove(csvDir, { recursive: true });
}

// The finalize stamp, read off the parquet that was just written rather than
// re-declared from the fixture — a manifest that disagreed with its own
// parquet would pin a shape production can never produce.
async function readParquetQueryMetadata(parquetPath: string): Promise<{
  columns: { name: string; duckDbType: string }[];
  columnNames: Set<string>;
  physicalTimeColumn: "period_id" | "quarter_id" | "year" | null;
  rowCount: number;
  periodBounds: { min: number; max: number } | null;
}> {
  const views = [{ viewName: "ro", parquetPath }];
  const describeRows = await executeSqlOverParquet(
    views,
    "DESCRIBE SELECT * FROM ro",
  );
  const columns = describeRows.map((r) => ({
    name: String(r.column_name),
    duckDbType: String(r.column_type),
  }));
  const columnNames = new Set(columns.map((c) => c.name));
  const physicalTimeColumn = columnNames.has("period_id")
    ? ("period_id" as const)
    : columnNames.has("quarter_id")
    ? ("quarter_id" as const)
    : columnNames.has("year")
    ? ("year" as const)
    : null;
  const aggRow = (
    await executeSqlOverParquet(
      views,
      physicalTimeColumn === null
        ? "SELECT count(*) AS n FROM ro"
        : `SELECT count(*) AS n, MIN(${physicalTimeColumn}) AS mn, MAX(${physicalTimeColumn}) AS mx FROM ro`,
    )
  )[0];
  return {
    columns,
    columnNames,
    physicalTimeColumn,
    rowCount: Number(aggRow.n),
    periodBounds: aggRow.mn === null || aggRow.mn === undefined
      ? null
      : { min: Number(aggRow.mn), max: Number(aggRow.mx) },
  };
}
