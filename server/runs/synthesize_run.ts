import { join } from "@std/path";
import type { Sql } from "postgres";
import {
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
  type RunFacilitiesTable,
  type RunManifest,
  type RunManifestDataset,
  type RunMetric,
  type RunMetricAvailability,
  type RunModule,
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
  buildRunIndicatorCatalog,
  runDirInputRowsReader,
} from "./indicator_catalog.ts";
import {
  runManifestPath,
  runResultsObjectParquetPath,
} from "./run_paths.ts";

// The run-package builder (PLAN_RESULTS_RUNS §3.8), called by the wizard
// pipeline's finalize (server/worker_routines/generate_run/) with the run's
// own outputs as the CSV source. It captures inputs (mirror JSONs,
// facilities parquet, declared assets), builds each results object's
// normalized query parquet, stamps metric availability, and writes the
// manifest — all inside runs/.tmp-{runId}; the caller owns the atomic rename
// and the catalog-row write.

// Everything the builder needs about the catalog and the input mirrors. The
// pipeline never writes to a database on the way here: it hands over what it
// captured, and the builder derives the rest from the tmp dir.
export type RunBuildSource = {
  modules: RunModule[];
  metrics: RunMetric[];
  datasets: RunManifestDataset[];
  // Input mirrors/facilities the caller already wrote into the tmp dir.
  facilitiesTables: RunFacilitiesTable[];
};

export type RunBuildOptions = {
  label: string;
  provenance: RunProvenance;
  source: RunBuildSource;
  // §3.7 memoization fields per module, computed by the reuse planner.
  moduleMemo: Map<
    string,
    { inputKey: string; outputFileHashes: Record<string, string> }
  > | null;
  // Directory holding a module's raw {roId} CSVs — the run's own
  // outputs/{moduleId}.
  moduleCsvDir: (moduleId: string) => string;
  // Relative paths (from the run dir root) of input files the caller already
  // placed in the tmp dir (the wizard's dataset extracts, twins, mirrors).
  extraInputFiles: string[];
};

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
  const runModules: RunModule[] = src.modules.map((m) => {
    const memo = opts.moduleMemo?.get(m.id);
    return {
      ...m,
      inputKey: memo?.inputKey ?? m.inputKey,
      outputFileHashes: memo?.outputFileHashes ?? m.outputFileHashes,
    };
  });
  const runMetrics = src.metrics;
  // Installed definitions keyed by module id — the results-object catalog and
  // the declared-asset capture below both read them.
  const moduleDefinitions = runModules.map((m) => ({
    id: m.id,
    moduleDefinition: m.moduleDefinition,
    lastRunAt: m.lastRunAt,
    lastRunGitRef: m.lastRunGitRef,
  }));

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
  // Input mirrors, facilities parquet and dataset stamps were written into
  // the tmp dir by prepare_inputs before this ran; the caller hands over what
  // it recorded about them.
  const facilitiesTables: RunFacilitiesTable[] = src.facilitiesTables;
  const datasets: RunManifestDataset[] = src.datasets;

  // Stamped here, at finalize, from the mirrors just written into tmpDir —
  // the same function the manifest transform recomputes with, so a package
  // built now and a package transformed forward carry an identical catalog.
  const indicators = await buildRunIndicatorCatalog(
    runModules,
    runDirInputRowsReader(tmpDir, inputFiles),
  );

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
