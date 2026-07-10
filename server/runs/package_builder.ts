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
import { _INSTANCE_CALENDAR, _SERVER_VERSION } from "../exposed_env_vars.ts";
import { deriveAvailableDisaggregationOptions } from "./disaggregation_availability.ts";
import { exportPgTableToParquet } from "./pg_export.ts";
import { invalidatePackageCaches } from "./manifest_cache.ts";
import {
  packageDirPath,
  packageInputFilePath,
  packageManifestPath,
  packageResultsObjectCsvPath,
  packageResultsObjectParquetPath,
} from "./run_paths.ts";

// The single metadata writer (PLAN_RESULTS_RUNS §3.8, eager finalize):
// rewrites manifest.json + inputs/ WHOLESALE from current project-DB state and
// captured instance config. Called eagerly at every project-level act
// (module-run completion, dataset add/remove, module install/uninstall/param
// change, project create/copy), by the per-request stamp-mismatch self-heal,
// and by the boot migration for projects without a manifest. Results-object
// parquet is written by ingest (the shadow-write beside each raw CSV) — this
// function only builds one when it is absent or older than its CSV
// (pre-Deploy-1 sandboxes, image rollbacks). Every file lands via tmp+rename,
// so concurrent acts leave a coherent last-writer-wins snapshot.

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

const IN_FLIGHT = new Map<string, Promise<void>>();

export function refreshSandboxPackage(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
): Promise<void> {
  const existing = IN_FLIGHT.get(projectId);
  if (existing) {
    return existing;
  }
  const promise = doRefresh(mainDb, projectDb, projectId).finally(() => {
    IN_FLIGHT.delete(projectId);
  });
  IN_FLIGHT.set(projectId, promise);
  return promise;
}

// For the eager hooks: the act itself already succeeded, so a finalize
// failure logs loudly and leaves the stale package for the per-request
// self-heal to retry (reads fail loudly until a refresh succeeds).
export async function refreshSandboxPackageSafe(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
): Promise<void> {
  try {
    await refreshSandboxPackage(mainDb, projectDb, projectId);
  } catch (e) {
    console.error(
      `[package] REFRESH FAILED for project ${projectId}: ${
        e instanceof Error ? e.message : e
      }`,
    );
  }
}

async function doRefresh(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
): Promise<void> {
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

  const packageDir = packageDirPath(projectId);
  await Deno.mkdir(join(packageDir, "inputs"), { recursive: true });

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
  // query metadata from the normalized parquet (the shadow-write, built here
  // from the raw CSV when missing/stale). A per-RO build failure degrades that
  // RO to hasParquet=false (metric stamped unavailable) rather than failing
  // the whole package.
  const runResultsObjects: RunResultsObject[] = [];
  for (const mod of modules) {
    const def = JSON.parse(mod.module_definition) as {
      resultsObjects?: {
        id: string;
        createTableStatementPossibleColumns: Record<string, string> | false;
      }[];
    };
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
      // drops the Postgres tables — the package must match, not resurrect).
      if (mod.last_run_at === null) {
        runResultsObjects.push(noQueryData);
        continue;
      }
      const parquetPath = packageResultsObjectParquetPath(
        packageDir,
        mod.id,
        ro.id,
      );
      try {
        const ready = await ensureResultsObjectParquet(
          packageResultsObjectCsvPath(packageDir, mod.id, ro.id),
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
          `[package] parquet FAILED for ${ro.id} in module ${mod.id} (project ${projectId}): ${
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
    await writeFileAtomic(
      packageInputFilePath(packageDir, fileName),
      JSON.stringify([...rows]),
    );
    inputFiles.push(`inputs/${fileName}`);
  }
  for (const tableName of INPUT_FACILITIES_TABLES) {
    const fileName = `${tableName}.parquet`;
    const finalPath = packageInputFilePath(packageDir, fileName);
    const tmpPath = `${finalPath}.tmp-${crypto.randomUUID()}`;
    const columns = await exportPgTableToParquet(projectDb, tableName, tmpPath);
    if (columns !== undefined) {
      await Deno.rename(tmpPath, finalPath);
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
    projectId,
    createdAt: new Date().toISOString(),
    appVersion: _SERVER_VERSION,
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
  await writeFileAtomic(
    packageManifestPath(packageDir),
    JSON.stringify(manifest, null, 2),
  );
  invalidatePackageCaches(projectId);
  console.log(
    `[package] refreshed project ${projectId} in ${
      (performance.now() - t0).toFixed(0)
    }ms`,
  );
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmpPath = `${path}.tmp-${crypto.randomUUID()}`;
  await Deno.writeTextFile(tmpPath, content);
  await Deno.rename(tmpPath, path);
}

async function statOrUndefined(path: string): Promise<Deno.FileInfo | undefined> {
  try {
    return await Deno.stat(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return undefined;
    throw e;
  }
}

// Returns true when a servable parquet exists after this call. The raw CSV is
// the source of truth: rebuild when the parquet is absent or older than its
// CSV; a parquet without a CSV (pruned raw output) still serves.
async function ensureResultsObjectParquet(
  csvPath: string,
  parquetPath: string,
  declaredColumns: Record<string, string>,
  facilityConfig: InstanceConfigFacilityColumns,
): Promise<boolean> {
  const csvStat = await statOrUndefined(csvPath);
  const parquetStat = await statOrUndefined(parquetPath);
  if (csvStat === undefined) {
    return parquetStat !== undefined;
  }
  const csvMtime = csvStat.mtime?.getTime() ?? 0;
  const parquetMtime = parquetStat?.mtime?.getTime() ?? -1;
  if (parquetStat !== undefined && parquetMtime >= csvMtime) {
    return true;
  }
  const csvHeaders = await readCsvHeaders(csvPath);
  await writeNormalizedResultsObjectParquet({
    csvPath,
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
