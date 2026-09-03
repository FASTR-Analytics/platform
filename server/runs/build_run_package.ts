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
  _SERVER_VERSION,
} from "../exposed_env_vars.ts";
import { deriveAvailableDisaggregationOptions } from "./disaggregation_availability.ts";
import {
  buildRunCommonIndicators,
  buildRunIndicatorCatalog,
  runDirInputRowsReader,
} from "./indicator_catalog.ts";
import { runManifestPath, runResultsObjectParquetPath } from "./run_paths.ts";

// The run-package builder — the wizard pipeline's ONE finalize
// (server/worker_routines/generate_run/pipeline.ts). The caller has already
// written the run's inputs (dataset extracts, mirrors, facilities parquet,
// person-years) and every module's raw output CSVs into runs/.tmp-{runId};
// this builds each results object's normalized query parquet from
// outputs/{moduleId}/{roId}, captures declared assets, stamps metric
// availability and the indicator catalog, and writes the manifest. The caller
// owns the atomic rename and the catalog-row/pointer transaction.

export type RunBuildOptions = {
  label: string;
  modules: RunModule[];
  metrics: RunMetric[];
  datasets: RunDataset[];
  // Input mirrors/facilities the caller already wrote into the tmp dir.
  facilitiesTables: RunFacilitiesTable[];
  // The person-years file the caller wrote (null without an HMIS capture).
  population: RunPopulation | null;
  // Run identity in the catalog summary: the launch-time attach targets.
  attachTargetProjectIds: string[];
  // Relative paths (from the run dir root) of input files the caller already
  // placed in the tmp dir (dataset extracts, twins, mirrors).
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

  const { modules: runModules, metrics: runMetrics } = opts;

  // Results-object catalog from the installed definitions; actual schema and
  // query metadata from the normalized parquet built from the module's raw
  // CSV. A per-RO build failure degrades that RO to hasParquet=false (metric
  // stamped unavailable) rather than failing the whole run.
  const runResultsObjects: RunResultsObject[] = [];
  for (const mod of runModules) {
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
      // A module that never ran has no query data.
      if (mod.lastRunAt === null) {
        runResultsObjects.push(noQueryData);
        continue;
      }
      const parquetPath = runResultsObjectParquetPath(tmpDir, mod.id, ro.id);
      try {
        const ready = await buildResultsObjectParquet(
          join(tmpDir, "outputs", mod.id, ro.id),
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

  // Caller-placed inputs (dataset extracts, mirrors, facilities parquet) are
  // recorded first; captured assets follow.
  const inputFiles: string[] = [...opts.extraInputFiles];

  // Pinned assets (§6.2): every asset the installed modules declare, copied
  // into inputs/assets/ and hashed into the manifest. Instance-uploaded
  // assets come from the Assets dir; pinned repo assets come from the
  // content-addressed cache, which is exact. A missing asset degrades loudly
  // (the module already ran) rather than failing the generation.
  const declaredAssets = new Map<
    string,
    { asset: AssetToImport; moduleId: string; gitRef: string | null }
  >();
  for (const mod of runModules) {
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

  const { facilitiesTables, datasets } = opts;

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
    provenance: "wizard",
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
    population: opts.population,
    inputFiles,
  };
  runManifestSchema.parse(manifest);
  await Deno.writeTextFile(
    runManifestPath(tmpDir),
    JSON.stringify(manifest, null, 2),
  );

  const summary: RunSummary = {
    manifestSchemaVersion: RUN_MANIFEST_SCHEMA_VERSION,
    provenance: "wizard",
    backfillSourceProjectId: null,
    attachTargetProjectIds: opts.attachTargetProjectIds,
    moduleIds: runModules.map((m) => m.id),
    metricCount: runMetrics.length,
    totalRowCount: runResultsObjects.reduce((sum, ro) => sum + ro.rowCount, 0),
    // The manifest above is the last file written, so the tmp dir is complete
    // here — the catalogue's disk column is stamped once, at the only moment
    // the package's contents are final and still immutable afterwards.
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

// Returns true when a servable parquet exists at parquetPath after this call:
// the module's raw CSV is rebuilt into parquet with the four finalize
// normalizations; no CSV means the module produced no rows for this object.
async function buildResultsObjectParquet(
  csvPath: string,
  parquetPath: string,
  declaredColumns: Record<string, string>,
  facilityConfig: StructureSchema | undefined,
): Promise<boolean> {
  try {
    await Deno.stat(csvPath);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return false;
    throw e;
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
