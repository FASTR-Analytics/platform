import { join } from "@std/path";
import type { Sql } from "postgres";
import {
  postAggregationExpressionStrict,
  RUN_MANIFEST_SCHEMA_VERSION,
  runManifestSchema,
  type DisaggregationOption,
  type InstanceConfigFacilityColumns,
  type RunDataset,
  type RunManifest,
  type RunMetric,
  type RunMetricAvailability,
  type RunModule,
  type RunResultsObject,
  type RunSummary,
} from "lib";
import {
  computeResultsObjectColumnsToExclude,
  executeSqlOverParquet,
  writeNormalizedResultsObjectParquet,
} from "../run_query/mod.ts";
import {
  getCountryIso3Config,
  getFacilityColumnsConfig,
} from "../db/instance/config.ts";
import {
  _INSTANCE_CALENDAR,
  _SANDBOX_DIR_PATH,
  _SERVER_VERSION,
} from "../exposed_env_vars.ts";
import { deriveAvailableDisaggregationOptions } from "./disaggregation_availability.ts";
import { exportPgTableToParquet } from "./pg_export.ts";
import {
  runDirPath,
  runInputFilePath,
  runManifestPath,
  runResultsObjectParquetPath,
  runTmpDirPath,
} from "./run_paths.ts";

// The backfill synthesizer (PLAN_RESULTS_RUNS Status, model point 5): mints a
// runId and builds an immutable runs/{runId} from the project's current
// sandbox CSVs + project-DB catalog + captured instance config. Copy, not
// move — sandbox and Postgres are untouched, so the migration is additive and
// the previous image still functions. Everything is built inside
// runs/.tmp-{runId} and atomically renamed at the end; the catalog row +
// projects.run_id repoint land in one transaction after the rename, so a
// crash mid-synthesis can never be observed by readers. Synthesized runs
// carry no memoization fields and are never reuse sources.

// getIndicatorMetadata's read surface, exported verbatim as inputs/<table>.json.
const INPUT_MIRROR_TABLES = [
  "indicators",
  "calculated_indicators_snapshot",
  "hfa_indicators_snapshot",
  "hfa_indicator_categories_snapshot",
  "hfa_indicator_sub_categories_snapshot",
  "hfa_indicator_service_categories_snapshot",
  "iceh_indicators_snapshot",
];

const INPUT_FACILITIES_TABLES = ["facilities_hmis", "facilities_hfa"];

export async function synthesizeRunForProject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  projectLabel: string,
): Promise<{ runId: string }> {
  const runId = crypto.randomUUID();
  const tmpDir = runTmpDirPath(runId);
  try {
    return await buildRun(mainDb, projectDb, projectId, projectLabel, runId, tmpDir);
  } catch (e) {
    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
    throw e;
  }
}

async function buildRun(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  projectLabel: string,
  runId: string,
  tmpDir: string,
): Promise<{ runId: string }> {
  const t0 = performance.now();
  const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
  if (resFacilityConfig.success === false) {
    throw new Error(`facility config: ${resFacilityConfig.err}`);
  }
  const facilityConfig = resFacilityConfig.data;
  const resCountry = await getCountryIso3Config(mainDb);
  const countryIso3 = resCountry.success
    ? resCountry.data.countryIso3 ?? null
    : null;

  await Deno.mkdir(join(tmpDir, "inputs"), { recursive: true });

  const modules = await projectDb<
    {
      id: string;
      module_definition: string;
      config_selections: string | null;
      last_run_at: string | null;
      last_run_git_ref: string | null;
    }[]
  >`
SELECT id, module_definition, config_selections, last_run_at, last_run_git_ref FROM modules
`;
  const runModules: RunModule[] = modules.map((m) => ({
    id: m.id,
    moduleDefinition: m.module_definition,
    configSelections: m.config_selections,
    lastRunAt: m.last_run_at,
    lastRunGitRef: m.last_run_git_ref,
    inputKey: null,
    outputFileHashes: null,
  }));

  const metrics = await projectDb<RunMetric[]>`
SELECT id, module_id, label, variant_label, value_func, format_as, value_props,
  required_disaggregation_options, value_label_replacements,
  post_aggregation_expression, results_object_id, ai_description, viz_presets,
  hide, important_notes
FROM metrics
`;
  const runMetrics: RunMetric[] = [...metrics];

  // Results-object catalog from the installed definitions; actual schema and
  // query metadata from the normalized parquet built into the run — copied
  // from the sandbox's ingest shadow-write when fresh, else rebuilt from the
  // raw CSV. A per-RO build failure degrades that RO to hasParquet=false
  // (metric stamped unavailable) rather than failing the whole run.
  const runResultsObjects: RunResultsObject[] = [];
  for (const mod of modules) {
    const def = JSON.parse(mod.module_definition) as {
      resultsObjects?: {
        id: string;
        createTableStatementPossibleColumns: Record<string, string> | false;
      }[];
    };
    if ((def.resultsObjects ?? []).length > 0) {
      await Deno.mkdir(join(tmpDir, "outputs", mod.id), { recursive: true });
    }
    for (const ro of def.resultsObjects ?? []) {
      const noQueryData: RunResultsObject = {
        id: ro.id,
        moduleId: mod.id,
        hasParquet: false,
        columns: [],
        hasFacilityId: false,
        physicalTimeColumn: null,
        availableDisaggregationOptions: [],
        rowCount: 0,
        periodBounds: null,
      };
      if (ro.createTableStatementPossibleColumns === false) {
        runResultsObjects.push(noQueryData);
        continue;
      }
      // A never-run module has no query data even when the sandbox holds
      // leftover CSVs from a previous install (uninstall keeps files but
      // drops the Postgres tables — the run must match, not resurrect).
      if (mod.last_run_at === null) {
        runResultsObjects.push(noQueryData);
        continue;
      }
      const parquetPath = runResultsObjectParquetPath(tmpDir, mod.id, ro.id);
      try {
        const ready = await buildResultsObjectParquet(
          join(_SANDBOX_DIR_PATH, projectId, mod.id, ro.id),
          parquetPath,
          ro.createTableStatementPossibleColumns,
          facilityConfig,
        );
        if (!ready) {
          runResultsObjects.push(noQueryData);
          continue;
        }
        const meta = await readParquetQueryMetadata(parquetPath);
        runResultsObjects.push({
          id: ro.id,
          moduleId: mod.id,
          hasParquet: true,
          columns: meta.columns,
          hasFacilityId: meta.columnNames.has("facility_id"),
          physicalTimeColumn: meta.physicalTimeColumn,
          availableDisaggregationOptions: deriveAvailableDisaggregationOptions(
            meta.columnNames,
            facilityConfig,
          ),
          rowCount: meta.rowCount,
          periodBounds: meta.periodBounds,
        });
      } catch (e) {
        console.error(
          `[runs] parquet FAILED for ${ro.id} in module ${mod.id} (project ${projectId}): ${
            e instanceof Error ? e.message : e
          }`,
        );
        runResultsObjects.push(noQueryData);
      }
    }
  }

  const metricAvailability: RunMetricAvailability[] = runMetrics.map((metric) =>
    computeMetricAvailability(metric, runResultsObjects),
  );

  // Input mirrors: dictionary/snapshot tables as JSON, facilities as parquet.
  const inputFiles: string[] = [];
  for (const tableName of INPUT_MIRROR_TABLES) {
    const exists = (
      await projectDb<{ n: string }[]>`
SELECT count(*) AS n FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = ${tableName}
`
    )[0];
    if (Number(exists.n) === 0) continue;
    const rows = await projectDb.unsafe(`SELECT * FROM "${tableName}"`);
    const fileName = `${tableName}.json`;
    await Deno.writeTextFile(
      runInputFilePath(tmpDir, fileName),
      JSON.stringify([...rows]),
    );
    inputFiles.push(`inputs/${fileName}`);
  }
  for (const tableName of INPUT_FACILITIES_TABLES) {
    const fileName = `${tableName}.parquet`;
    const columns = await exportPgTableToParquet(
      projectDb,
      tableName,
      runInputFilePath(tmpDir, fileName),
    );
    if (columns !== undefined) {
      inputFiles.push(`inputs/${fileName}`);
    }
  }

  const datasetRows = await projectDb<
    { dataset_type: string; info: string; last_updated: string }[]
  >`
SELECT dataset_type, info, last_updated FROM datasets
`;
  const datasets: RunDataset[] = datasetRows.map((d) => ({
    datasetType: d.dataset_type,
    lastUpdated: d.last_updated,
    info: JSON.parse(d.info),
  }));

  const manifest: RunManifest = {
    manifestSchemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
    runId,
    createdAt: new Date().toISOString(),
    label: projectLabel,
    provenance: "synthetic-backfill",
    appVersion: _SERVER_VERSION,
    rImageTag: null,
    calendar: _INSTANCE_CALENDAR,
    countryIso3,
    facilityColumnsConfig: facilityConfig,
    datasets,
    modules: runModules,
    metrics: runMetrics,
    resultsObjects: runResultsObjects,
    metricAvailability,
    inputFiles,
  };
  runManifestSchema.parse(manifest);
  await Deno.writeTextFile(
    runManifestPath(tmpDir),
    JSON.stringify(manifest, null, 2),
  );

  // Atomic publish: rename, then catalog row + pointer in one transaction.
  await Deno.rename(tmpDir, runDirPath(runId));
  const summary: RunSummary = {
    manifestSchemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
    provenance: "synthetic-backfill",
    sourceProjectId: projectId,
    moduleIds: runModules.map((m) => m.id),
    metricCount: runMetrics.length,
    totalRowCount: runResultsObjects.reduce((sum, ro) => sum + ro.rowCount, 0),
  };
  await mainDb.begin(async (sql) => {
    await sql`
INSERT INTO runs (id, label, status, provenance, created_by, summary)
VALUES (${runId}, ${projectLabel}, 'ready', 'synthetic-backfill', NULL, ${JSON.stringify(summary)})
`;
    await sql`UPDATE projects SET run_id = ${runId} WHERE id = ${projectId}`;
  });

  console.log(
    `[runs] synthesized run ${runId} for project ${projectId} in ${
      (performance.now() - t0).toFixed(0)
    }ms`,
  );
  return { runId };
}

async function statOrUndefined(path: string): Promise<Deno.FileInfo | undefined> {
  try {
    return await Deno.stat(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return undefined;
    throw e;
  }
}

// Returns true when a servable parquet exists at parquetPath after this call.
// The sandbox raw CSV is the source of truth: the sandbox's ingest-written
// sibling parquet is copied when it is at least as fresh as its CSV, else the
// parquet is rebuilt from the CSV with the four finalize normalizations. A
// sandbox parquet without a CSV (pruned raw output) still serves.
async function buildResultsObjectParquet(
  sandboxCsvPath: string,
  parquetPath: string,
  declaredColumns: Record<string, string>,
  facilityConfig: InstanceConfigFacilityColumns,
): Promise<boolean> {
  const sandboxParquetPath = `${sandboxCsvPath}.parquet`;
  const csvStat = await statOrUndefined(sandboxCsvPath);
  const sandboxParquetStat = await statOrUndefined(sandboxParquetPath);
  if (csvStat === undefined) {
    if (sandboxParquetStat === undefined) return false;
    await Deno.copyFile(sandboxParquetPath, parquetPath);
    return true;
  }
  const csvMtime = csvStat.mtime?.getTime() ?? 0;
  const sandboxParquetMtime = sandboxParquetStat?.mtime?.getTime() ?? -1;
  if (sandboxParquetStat !== undefined && sandboxParquetMtime >= csvMtime) {
    await Deno.copyFile(sandboxParquetPath, parquetPath);
    return true;
  }
  const csvHeaders = await readCsvHeaders(sandboxCsvPath);
  await writeNormalizedResultsObjectParquet({
    csvPath: sandboxCsvPath,
    parquetPath,
    csvHeaders,
    declaredColumns,
    columnsToExclude: computeResultsObjectColumnsToExclude(
      csvHeaders,
      facilityConfig,
    ),
  });
  return true;
}

// R-written headers are plain lowercase identifiers (enforced downstream by
// the SAFE_COLUMN_NAME check), so a first-line split is sufficient.
async function readCsvHeaders(csvPath: string): Promise<string[]> {
  const file = await Deno.open(csvPath, { read: true });
  const buffer = new Uint8Array(16384);
  const bytesRead = await file.read(buffer);
  file.close();
  if (!bytesRead) {
    throw new Error(`CSV file is empty: ${csvPath}`);
  }
  const chunk = new TextDecoder().decode(buffer.slice(0, bytesRead));
  const newlineIndex = chunk.indexOf("\n");
  const firstLine = (newlineIndex === -1 ? chunk : chunk.slice(0, newlineIndex))
    .replace(/\r$/, "");
  const headers = firstLine
    .split(",")
    .map((h) => h.replace(/^"|"$/g, "").trim());
  if (headers.length === 0 || headers[0] === "") {
    throw new Error(`CSV header row is empty: ${csvPath}`);
  }
  return headers;
}

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
  const rowCount = Number(aggRow.n);
  const periodBounds =
    physicalTimeColumn !== null &&
    aggRow.mn !== null &&
    aggRow.mn !== undefined &&
    aggRow.mx !== null &&
    aggRow.mx !== undefined
      ? { min: Number(aggRow.mn), max: Number(aggRow.mx) }
      : null;
  return { columns, columnNames, physicalTimeColumn, rowCount, periodBounds };
}

function computeMetricAvailability(
  metric: RunMetric,
  resultsObjects: RunResultsObject[],
): RunMetricAvailability {
  const unavailable = (reason: string): RunMetricAvailability => ({
    metricId: metric.id,
    status: "unavailable",
    reason,
  });
  const ro = resultsObjects.find((r) => r.id === metric.results_object_id);
  if (!ro || !ro.hasParquet) {
    return unavailable("results object has no query data in this run");
  }
  if (ro.rowCount === 0) {
    return unavailable("results object has no rows");
  }
  const columnNames = new Set(ro.columns.map((c) => c.name));
  const pae = metric.post_aggregation_expression
    ? postAggregationExpressionStrict.parse(
        JSON.parse(metric.post_aggregation_expression),
      )
    : undefined;
  const neededProps = pae
    ? pae.ingredientValues.map((v) => v.prop)
    : (JSON.parse(metric.value_props) as string[]);
  const missingProps = neededProps.filter((p) => !columnNames.has(p));
  if (missingProps.length > 0) {
    return unavailable(
      `value props not in results object: ${missingProps.join(", ")}`,
    );
  }
  const required = JSON.parse(
    metric.required_disaggregation_options,
  ) as DisaggregationOption[];
  const missingDisOpts = required.filter(
    (d) => !ro.availableDisaggregationOptions.includes(d),
  );
  if (missingDisOpts.length > 0) {
    return unavailable(
      `required disaggregation options not available: ${missingDisOpts.join(", ")}`,
    );
  }
  return { metricId: metric.id, status: "available", reason: null };
}
