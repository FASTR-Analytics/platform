import { join } from "@std/path";
import type { Sql } from "postgres";
import {
  postAggregationExpressionStrict,
  RUN_MANIFEST_SCHEMA_VERSION,
  runManifestSchema,
  type DisaggregationOption,
  type RunDataset,
  type RunManifest,
  type RunMetric,
  type RunMetricAvailability,
  type RunModule,
  type RunResultsObject,
  type RunSummary,
} from "lib";
import { getResultsObjectTableName } from "../db/utils.ts";
import { getCountryIso3Config, getFacilityColumnsConfig } from "../db/instance/config.ts";
import { _INSTANCE_CALENDAR, _SERVER_VERSION } from "../exposed_env_vars.ts";
import { deriveAvailableDisaggregationOptions } from "./disaggregation_availability.ts";
import { exportPgTableToParquet } from "./pg_export.ts";
import {
  runDirPath,
  runInputFilePath,
  runManifestPath,
  runQueryParquetPath,
  runTmpDirPath,
} from "./run_paths.ts";

// Synthesizes one run per existing project from its PROJECT DB (never the
// sandbox — verified incoherent; the DB is what today's queries serve).
// Synthetic runs are query-only shells: no raw CSVs, no dataset extracts, no
// file-only results objects; they cannot be re-executed and are never
// memoization reuse sources (PLAN_RESULTS_RUNS §4 Phase 1).

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
  const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
  if (resFacilityConfig.success === false) {
    throw new Error(`facility config: ${resFacilityConfig.err}`);
  }
  const facilityConfig = resFacilityConfig.data;
  const resCountry = await getCountryIso3Config(mainDb);
  const countryIso3 = resCountry.success ? resCountry.data.countryIso3 ?? null : null;

  const runId = crypto.randomUUID();
  const tmpDir = runTmpDirPath(runId);
  await Deno.mkdir(join(tmpDir, "query"), { recursive: true });
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

  // Results-object catalog from the installed definitions; actual schema from
  // the exported ro_* tables (the DB is the truth for synthetic runs).
  const runResultsObjects: RunResultsObject[] = [];
  for (const mod of modules) {
    const def = JSON.parse(mod.module_definition) as {
      resultsObjects?: { id: string }[];
    };
    for (const ro of def.resultsObjects ?? []) {
      const tableName = getResultsObjectTableName(ro.id);
      const parquetPath = runQueryParquetPath(tmpDir, ro.id);
      const columns = await exportPgTableToParquet(projectDb, tableName, parquetPath);
      if (columns === undefined) {
        runResultsObjects.push({
          id: ro.id,
          moduleId: mod.id,
          hasParquet: false,
          columns: [],
          hasFacilityId: false,
          physicalTimeColumn: null,
          availableDisaggregationOptions: [],
          rowCount: 0,
          periodBounds: null,
        });
        continue;
      }
      const columnNames = new Set(columns.map((c) => c.name));
      const physicalTimeColumn = columnNames.has("period_id")
        ? ("period_id" as const)
        : columnNames.has("quarter_id")
          ? ("quarter_id" as const)
          : columnNames.has("year")
            ? ("year" as const)
            : null;
      const rowCount = Number(
        (
          await projectDb.unsafe<{ n: string }[]>(
            `SELECT count(*) AS n FROM "${tableName}"`,
          )
        )[0].n,
      );
      let periodBounds: { min: number; max: number } | null = null;
      if (physicalTimeColumn !== null && rowCount > 0) {
        const bounds = (
          await projectDb.unsafe<{ mn: number | null; mx: number | null }[]>(
            `SELECT MIN(${physicalTimeColumn}) AS mn, MAX(${physicalTimeColumn}) AS mx FROM "${tableName}"`,
          )
        )[0];
        if (bounds.mn !== null && bounds.mx !== null) {
          periodBounds = { min: Number(bounds.mn), max: Number(bounds.mx) };
        }
      }
      runResultsObjects.push({
        id: ro.id,
        moduleId: mod.id,
        hasParquet: true,
        columns,
        hasFacilityId: columnNames.has("facility_id"),
        physicalTimeColumn,
        availableDisaggregationOptions: deriveAvailableDisaggregationOptions(
          columnNames,
          facilityConfig,
        ),
        rowCount,
        periodBounds,
      });
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
    sourceProjectId: projectId,
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
  await Deno.writeTextFile(runManifestPath(tmpDir), JSON.stringify(manifest, null, 2));

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

  return { runId };
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
    return unavailable(`value props not in results object: ${missingProps.join(", ")}`);
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
