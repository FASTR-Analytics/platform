import { join } from "@std/path";
import type { Sql } from "postgres";
import {
  catalogExpressionEvaluationStrict,
  getAssetToImportName,
  getDatasetFamily,
  postAggregationExpressionStrict,
  RUN_MANIFEST_SCHEMA_VERSION,
  runManifestSchema,
  type AssetToImport,
  structureColumnsFromSchema,
  type DatasetType,
  type DisaggregationOption,
  type RunAsset,
  type RunDataset,
  type RunFacilitiesTable,
  type RunManifest,
  type RunMetric,
  type RunMetricAvailability,
  type RunModule,
  type RunPopulation,
  type RunProvenance,
  type RunResultsObject,
  type RunSummary,
  type StructureSchema,
} from "lib";
import {
  computeResultsObjectColumnsToExclude,
  executeSqlOverParquet,
  writeNormalizedResultsObjectParquet,
} from "../run_query/mod.ts";
import { getStructureSchema } from "../db/instance/config.ts";
import { resolveAssetFilePath } from "../db/instance/assets.ts";
import { ensureRepoAssetCached } from "../module_loader/repo_assets.ts";
import { R_DOCKER_IMAGE_TAG } from "../worker_routines/generate_run/r_docker_image.ts";
import {
  _INSTANCE_CALENDAR,
  _INSTANCE_COUNTRY_ISO3,
  _SANDBOX_DIR_PATH,
  _SERVER_VERSION,
} from "../exposed_env_vars.ts";
import { deriveAvailableDisaggregationOptions } from "./disaggregation_availability.ts";
import {
  buildRunCommonIndicators,
  buildRunIndicatorCatalog,
  runDirInputRowsReader,
} from "./indicator_catalog.ts";
import { exportPgTableToParquet } from "./pg_export.ts";
import {
  runDirPath,
  runInputFilePath,
  runManifestPath,
  runResultsObjectParquetPath,
  runTmpDirPath,
} from "./run_paths.ts";

// The run-package builder, shared by its two writers (PLAN_RESULTS_RUNS
// §3.8): the backfill synthesizer here, and the wizard pipeline's finalize
// (server/worker_routines/generate_run/), which calls buildRunPackageIntoTmp
// with the run's own outputs as the CSV source. The builder captures inputs
// (mirror JSONs, facilities parquet, declared assets), builds each results
// object's normalized query parquet, stamps metric availability, and writes
// the manifest — all inside runs/.tmp-{runId}; the caller owns the atomic
// rename and the catalog-row/pointer transaction.
//
// The synthesizer (Status, model point 5) mints a runId and builds from the
// project's current sandbox CSVs + project-DB catalog + captured instance
// config. Copy, not move — sandbox and Postgres are untouched, so the
// migration is additive and the previous image still functions. Synthesized
// runs carry no memoization fields and are never reuse sources.

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

// Where the builder gets the catalog + input mirrors. Under the
// no-dual-write model (Phase 3 re-cut ruling 5) a wizard generation never
// writes to a project DB, so it hands the builder everything it captured;
// the backfill synthesizer still reads the (frozen) project plane.
export type RunBuildSource =
  | {
    kind: "project_db";
    projectDb: Sql;
    projectId: string;
    // Restrict the captured catalog to these modules; null = all of them.
    moduleIds: string[] | null;
  }
  | {
    kind: "captured";
    modules: RunModule[];
    metrics: RunMetric[];
    datasets: RunDataset[];
    // Input mirrors/facilities the caller already wrote into the tmp dir.
    facilitiesTables: RunFacilitiesTable[];
    // The person-years file the caller wrote (null without an HMIS
    // capture); a backfill never has one.
    population: RunPopulation | null;
  };

export type RunBuildOptions = {
  label: string;
  provenance: RunProvenance;
  source: RunBuildSource;
  // Run identity in the catalog summary (Q-A). Only the backfill
  // synthesizer stamps a source project — it is what makes a run 1:1 with a
  // project's frozen Postgres plane, which is the rig's gating rule.
  // Wizard runs carry null and list their launch-time attach targets
  // instead.
  backfillSourceProjectId: string | null;
  attachTargetProjectIds: string[];
  // §3.7 memoization fields per module — computed only by real wizard
  // generation; synthesized runs carry null and are never reuse sources.
  moduleMemo: Map<
    string,
    { inputKey: string; outputFileHashes: Record<string, string> }
  > | null;
  // Directory holding a module's raw {roId} CSVs: the project sandbox for
  // synthesis, the run's own outputs/{moduleId} for the wizard finalize.
  moduleCsvDir: (moduleId: string) => string;
  // Relative paths (from the run dir root) of input files the caller already
  // placed in the tmp dir (the wizard's dataset extracts, twins, mirrors).
  extraInputFiles: string[];
};

export async function synthesizeRunForProject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  projectLabel: string,
): Promise<{ runId: string }> {
  const runId = crypto.randomUUID();
  const tmpDir = runTmpDirPath(runId);
  const t0 = performance.now();
  try {
    const { summary } = await buildRunPackageIntoTmp(
      mainDb,
      runId,
      tmpDir,
      {
        label: projectLabel,
        provenance: "synthetic-backfill",
        source: { kind: "project_db", projectDb, projectId, moduleIds: null },
        backfillSourceProjectId: projectId,
        attachTargetProjectIds: [projectId],
        moduleMemo: null,
        moduleCsvDir: (moduleId) => join(_SANDBOX_DIR_PATH, projectId, moduleId),
        extraInputFiles: [],
      },
    );
    // Atomic publish: rename, then catalog row + pointer in one transaction.
    await Deno.rename(tmpDir, runDirPath(runId));
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
  } catch (e) {
    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
    throw e;
  }
}

export async function buildRunPackageIntoTmp(
  mainDb: Sql,
  runId: string,
  tmpDir: string,
  opts: RunBuildOptions,
): Promise<{ manifest: RunManifest; summary: RunSummary }> {
  const resSchemaHmis = await getStructureSchema(mainDb, "hmis");
  if (resSchemaHmis.success === false) {
    throw new Error(`hmis structure schema: ${resSchemaHmis.err}`);
  }
  const resSchemaHfa = await getStructureSchema(mainDb, "hfa");
  if (resSchemaHfa.success === false) {
    throw new Error(`hfa structure schema: ${resSchemaHfa.err}`);
  }
  const schemaByFamily = (
    family: DatasetType | null | undefined,
  ): StructureSchema | undefined =>
    family === "hmis"
      ? resSchemaHmis.data
      : family === "hfa"
      ? resSchemaHfa.data
      : undefined;
  const countryIso3 = _INSTANCE_COUNTRY_ISO3;

  await Deno.mkdir(join(tmpDir, "inputs"), { recursive: true });

  const src = opts.source;
  let runModules: RunModule[];
  let runMetrics: RunMetric[];
  // Installed definitions keyed by module id — the results-object catalog and
  // the declared-asset capture below read them from either source.
  let moduleDefinitions: {
    id: string;
    moduleDefinition: string;
    lastRunAt: string | null;
    lastRunGitRef: string | null;
  }[];

  if (src.kind === "captured") {
    runModules = src.modules.map((m) => {
      const memo = opts.moduleMemo?.get(m.id);
      return {
        ...m,
        inputKey: memo?.inputKey ?? m.inputKey,
        outputFileHashes: memo?.outputFileHashes ?? m.outputFileHashes,
      };
    });
    runMetrics = src.metrics;
    moduleDefinitions = runModules.map((m) => ({
      id: m.id,
      moduleDefinition: m.moduleDefinition,
      lastRunAt: m.lastRunAt,
      lastRunGitRef: m.lastRunGitRef,
    }));
  } else {
    const { projectDb, moduleIds } = src;
    const modules = await projectDb<
      {
        id: string;
        module_definition: string;
        config_selections: string | null;
        last_run_at: string | null;
        last_run_git_ref: string | null;
      }[]
    >`
SELECT id, module_definition, config_selections, last_run_at, last_run_git_ref
FROM modules
${moduleIds === null ? projectDb`` : projectDb`WHERE id = ANY(${moduleIds})`}
`;
    if (moduleIds !== null) {
      const present = new Set(modules.map((m) => m.id));
      const missing = moduleIds.filter((id) => !present.has(id));
      if (missing.length > 0) {
        throw new Error(
          `run modules missing from project catalog: ${missing.join(", ")}`,
        );
      }
    }
    runModules = modules.map((m) => {
      const memo = opts.moduleMemo?.get(m.id);
      return {
        id: m.id,
        moduleDefinition: m.module_definition,
        configSelections: m.config_selections,
        lastRunAt: m.last_run_at,
        lastRunGitRef: m.last_run_git_ref,
        inputKey: memo?.inputKey ?? null,
        outputFileHashes: memo?.outputFileHashes ?? null,
      };
    });

    const metrics = await projectDb<Omit<RunMetric, "datasetFamily">[]>`
SELECT id, module_id, label, variant_label, value_func, format_as, value_props,
  required_disaggregation_options, value_label_replacements,
  post_aggregation_expression, results_object_id, ai_description, viz_presets,
  hide, important_notes
FROM metrics
${moduleIds === null ? projectDb`` : projectDb`WHERE module_id = ANY(${moduleIds})`}
`;
    const familyByModuleId = new Map(
      modules.map((m) => [m.id, getDatasetFamily(m.module_definition) ?? null]),
    );
    runMetrics = metrics.map((m) => ({
      ...m,
      datasetFamily: familyByModuleId.get(m.module_id) ?? null,
      // Not selected, because the project `metrics` table has no such column
      // and correctly never will — metrics[] is generation-only provenance, so
      // a field that did not exist when these rows were written is carried
      // forward as null rather than synthesized. Manifest transform block 4
      // does exactly this for packages written before v6.
      catalog_expression_evaluation: null,
    }));
    moduleDefinitions = modules.map((m) => ({
      id: m.id,
      moduleDefinition: m.module_definition,
      lastRunAt: m.last_run_at,
      lastRunGitRef: m.last_run_git_ref,
    }));
  }

  // Results-object catalog from the installed definitions; actual schema and
  // query metadata from the normalized parquet built into the run — copied
  // from the sandbox's ingest shadow-write when fresh, else rebuilt from the
  // raw CSV. A per-RO build failure degrades that RO to hasParquet=false
  // (metric stamped unavailable) rather than failing the whole run.
  const runResultsObjects: RunResultsObject[] = [];
  for (const mod of moduleDefinitions) {
    // The module's own family selects which structure schema governs its
    // facility columns (iceh/unknown → none)
    const moduleFamilySchema = schemaByFamily(
      getDatasetFamily(mod.moduleDefinition),
    );
    const def = JSON.parse(mod.moduleDefinition) as {
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
      if (mod.lastRunAt === null) {
        runResultsObjects.push(noQueryData);
        continue;
      }
      const parquetPath = runResultsObjectParquetPath(tmpDir, mod.id, ro.id);
      try {
        const ready = await buildResultsObjectParquet(
          join(opts.moduleCsvDir(mod.id), ro.id),
          parquetPath,
          ro.createTableStatementPossibleColumns,
          moduleFamilySchema,
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
            moduleFamilySchema,
          ),
          rowCount: meta.rowCount,
          periodBounds: meta.periodBounds,
        });
      } catch (e) {
        console.error(
          `[runs] parquet FAILED for ${ro.id} in module ${mod.id} (run ${runId}): ${
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
  // Caller-placed inputs (the wizard's dataset extracts) are recorded first.
  const inputFiles: string[] = [...opts.extraInputFiles];

  // Pinned assets (§6.2): every asset the installed modules declare, copied
  // into inputs/assets/ and hashed into the manifest. Instance-uploaded
  // assets come from the Assets dir (the current file is the best available
  // stand-in at synthesis time for what the module read); pinned repo assets
  // come from the content-addressed cache, which is exact. A missing asset
  // degrades loudly (the module already ran) rather than failing the
  // backfill. The wizard finalize inherits this capture with the same layout.
  const declaredAssets = new Map<
    string,
    { asset: AssetToImport; moduleId: string; gitRef: string | null }
  >();
  for (const mod of moduleDefinitions) {
    const def = JSON.parse(mod.moduleDefinition) as {
      assetsToImport?: AssetToImport[];
    };
    for (const asset of def.assetsToImport ?? []) {
      declaredAssets.set(getAssetToImportName(asset), {
        asset,
        moduleId: mod.id,
        gitRef: mod.lastRunGitRef,
      });
    }
  }
  const assets: RunAsset[] = [];
  if (declaredAssets.size > 0) {
    await Deno.mkdir(join(tmpDir, "inputs", "assets"), { recursive: true });
  }
  for (const fileName of [...declaredAssets.keys()].sort()) {
    const { asset, moduleId, gitRef } = declaredAssets.get(fileName)!;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const sourcePath = typeof asset === "string"
        ? resolveAssetFilePath(asset)
        : await ensureRepoAssetCached(moduleId, asset, gitRef);
      bytes = await Deno.readFile(sourcePath);
    } catch (e) {
      console.error(
        `[runs] asset "${fileName}" not captured for run ${runId}: ${
          e instanceof Error ? e.message : e
        }`,
      );
      continue;
    }
    await Deno.writeFile(join(tmpDir, "inputs", "assets", fileName), bytes);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    assets.push({ fileName, sha256 });
    inputFiles.push(`inputs/assets/${fileName}`);
  }
  // Input mirrors + facilities parquet + dataset stamps: the captured source
  // already wrote its own into the tmp dir (prepare_inputs), so only the
  // project_db source exports them here.
  let facilitiesTables: RunFacilitiesTable[];
  let datasets: RunDataset[];
  if (src.kind === "captured") {
    facilitiesTables = src.facilitiesTables;
    datasets = src.datasets;
  } else {
    const { projectDb } = src;
    facilitiesTables = [];
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
        facilitiesTables.push({ tableName, columns });
      }
    }
    const datasetRows = await projectDb<
      { dataset_type: string; info: string; last_updated: string }[]
    >`
SELECT dataset_type, info, last_updated FROM datasets
`;
    datasets = datasetRows.map((d) => ({
      datasetType: d.dataset_type,
      lastUpdated: d.last_updated,
      info: JSON.parse(d.info),
    }));
  }

  // Stamped here, at finalize, from the mirrors just written into tmpDir —
  // the same function the manifest transform recomputes with, so a package
  // built now and a package transformed forward carry an identical catalog.
  const inputRowsReader = runDirInputRowsReader(tmpDir, inputFiles);
  const indicators = await buildRunIndicatorCatalog(
    runModules,
    inputRowsReader,
  );
  const commonIndicators = await buildRunCommonIndicators(inputRowsReader);

  const manifest: RunManifest = {
    manifestSchemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
    runId,
    createdAt: new Date().toISOString(),
    label: opts.label,
    provenance: opts.provenance,
    appVersion: _SERVER_VERSION,
    rImageTag: R_DOCKER_IMAGE_TAG,
    calendar: _INSTANCE_CALENDAR,
    countryIso3,
    // Per-family slot, stamped only for families whose facilities parquet
    // made it into the package. The projection drops adminDepth — the
    // manifest carries flags + labels only (ruling: a field nothing on the
    // read path consumes must not exist in the file).
    structureSchemaHmis: facilitiesTables.some((t) => t.tableName === "facilities_hmis")
      ? structureColumnsFromSchema(resSchemaHmis.data)
      : null,
    structureSchemaHfa: facilitiesTables.some((t) => t.tableName === "facilities_hfa")
      ? structureColumnsFromSchema(resSchemaHfa.data)
      : null,
    datasets,
    facilitiesTables,
    assets,
    modules: runModules,
    metrics: runMetrics,
    resultsObjects: runResultsObjects,
    metricAvailability,
    indicators,
    commonIndicators,
    population: src.kind === "captured" ? src.population : null,
    inputFiles,
  };
  runManifestSchema.parse(manifest);
  await Deno.writeTextFile(
    runManifestPath(tmpDir),
    JSON.stringify(manifest, null, 2),
  );

  const summary: RunSummary = {
    manifestSchemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
    provenance: opts.provenance,
    backfillSourceProjectId: opts.backfillSourceProjectId,
    attachTargetProjectIds: opts.attachTargetProjectIds,
    moduleIds: runModules.map((m) => m.id),
    metricCount: runMetrics.length,
    totalRowCount: runResultsObjects.reduce((sum, ro) => sum + ro.rowCount, 0),
    // The manifest above is the last file either writer produces, so the tmp
    // dir is complete here — the catalogue's disk column is stamped once, at
    // the only moment the package's contents are final and still immutable
    // afterwards.
    diskSizeBytes: await sumFileSizes(tmpDir),
  };
  return { manifest, summary };
}

async function sumFileSizes(dir: string): Promise<number> {
  let total = 0;
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory) {
      total += await sumFileSizes(path);
    } else if (entry.isFile) {
      total += (await Deno.stat(path)).size;
    }
  }
  return total;
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
  facilityConfig: StructureSchema | undefined,
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
// the SAFE_COLUMN_NAME check), so a first-line split is sufficient. Also
// used by the wizard pipeline on Postgres COPY-written dataset extracts,
// whose headers are plain identifiers too.
export async function readCsvHeaders(csvPath: string): Promise<string[]> {
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

export function computeMetricAvailability(
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
  const neededProps = requiredPhysicalProps(metric);
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

// The columns a metric reads from the parquet. A catalog-evaluated metric's
// `value` is synthesized at read time from its ingredient columns, and a
// post-aggregation metric's props are its ingredients; only a plain metric
// reads its value props directly.
function requiredPhysicalProps(metric: RunMetric): string[] {
  if (metric.catalog_expression_evaluation) {
    return catalogExpressionEvaluationStrict.parse(
      JSON.parse(metric.catalog_expression_evaluation),
    ).ingredientProps;
  }
  if (metric.post_aggregation_expression) {
    return postAggregationExpressionStrict
      .parse(JSON.parse(metric.post_aggregation_expression))
      .ingredientValues.map((v) => v.prop);
  }
  return JSON.parse(metric.value_props) as string[];
}
