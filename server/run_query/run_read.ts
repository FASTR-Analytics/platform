import { z } from "zod";
import type { Sql } from "postgres";
import {
  composeHfaIndicatorLabel,
  disaggregationOption,
  getDisaggregationAllowedPresentationOptions,
  getEnabledOptionalFacilityColumns,
  getHfaIndicatorMeasure,
  getStartingModuleConfigSelections,
  getValidatedModuleId,
  ICEH_STRAT_INFO,
  metricAIDescriptionInstalled,
  parseInstalledModuleDefinition,
  parsePresentationObjectConfig,
  postAggregationExpressionStrict,
  throwIfErrWithData,
  vizPresetInstalled,
  type APIResponseWithData,
  type DatasetType,
  type GenericLongFormFetchConfig,
  type HfaIndicatorAggregation,
  type HfaIndicatorType,
  type IndicatorMetadata,
  type InstalledModuleSummary,
  type InstalledModuleWithConfigSelections,
  type ItemsHolderPresentationObject,
  type ItemsHolderResultsObject,
  type MetricWithStatus,
  type ModuleId,
  type PeriodBounds,
  type PeriodOption,
  type PresentationObjectDetail,
  type ResultsValue,
  type ResultsValueInfoForPresentationObject,
  type RunManifest,
  type RunMetric,
  type RunModule,
  type RunResultsObject,
} from "lib";
import { getResultsObjectTableName, tryCatchDatabaseAsync } from "../db/utils.ts";
import { inferMostGranularTimePeriodColumn } from "../db/project/metric_enricher.ts";
import { parseModuleConfigSelections } from "../db/project/modules.ts";
import {
  getRunManifestCached,
  readRunInputJsonCached,
} from "../runs/manifest_cache.ts";
import {
  runDirPath,
  runInputFilePath,
  runResultsObjectParquetPath,
} from "../runs/run_paths.ts";
import {
  getDatasetFamily,
  getDatasetTypes,
} from "../server_only_funcs_presentation_objects/get_indicator_metadata.ts";
import { computeFacilityContext } from "../server_only_funcs_presentation_objects/get_query_context.ts";
import {
  buildMinimalFetchConfig,
  getPossibleValuesCore,
} from "../server_only_funcs_presentation_objects/get_possible_values.ts";
import { getPresentationObjectItemsCore } from "../server_only_funcs_presentation_objects/get_presentation_object_items.ts";
import { buildResultsValueInfo } from "../server_only_funcs_presentation_objects/get_results_value_info.ts";
import {
  detectNeededPeriodColumns,
  needsPeriodCTEFor,
} from "../server_only_funcs_presentation_objects/period_helpers.ts";
import type {
  QueryContext,
  SqlRowsExecutor,
} from "../server_only_funcs_presentation_objects/types.ts";
import { executeSqlOverParquet, type ParquetView } from "./duckdb_executor.ts";
import {
  findVirtualDefault,
  VIRTUAL_DEFAULT_LAST_UPDATED,
} from "./virtual_defaults.ts";

// The run read path (PLAN_RESULTS_RUNS Status, model point 3): every function
// here consults ONLY the attached immutable run — manifest for metadata (no
// probes), parquet for data. The SQL builders and status logic are the SAME
// code the Postgres path uses; only the context source and the executor differ
// (§2.4). The Postgres read functions stay in-tree solely as the parity rig's
// baseline until demolition.

export type RunReadContext = {
  runId: string;
  runDir: string;
  manifest: RunManifest;
};

// Resolves the project's attached run via projects.run_id — the one and only
// serving pointer. No run attached is a typed, expected state (projects await
// their backfill synthesis or first wizard generation); a non-null pointer to
// an unreadable run is an operational error surfaced loudly.
export async function getRunReadContext(
  mainDb: Sql,
  projectId: string,
): Promise<APIResponseWithData<RunReadContext>> {
  try {
    const row = (
      await mainDb<{ run_id: string | null }[]>`
SELECT run_id FROM projects WHERE id = ${projectId}
`
    ).at(0);
    if (row === undefined) {
      return { success: false, err: "Project not found" };
    }
    if (row.run_id === null) {
      return {
        success: false,
        err: "No results package attached to this project",
      };
    }
    const manifest = await getRunManifestCached(row.run_id);
    return {
      success: true,
      data: { runId: row.run_id, runDir: runDirPath(row.run_id), manifest },
    };
  } catch (e) {
    return {
      success: false,
      err: `Results run unavailable: ${e instanceof Error ? e.message : e}`,
    };
  }
}

// Same format as the legacy per-request getDatasetsVersion, but from the
// manifest's frozen stamps — carried in holders for provenance.
export function datasetsVersionFromManifest(manifest: RunManifest): string {
  return [...manifest.datasets]
    .sort((a, b) => (a.datasetType < b.datasetType ? -1 : 1))
    .map((d) => `${d.datasetType}:${d.lastUpdated}`)
    .join(",");
}

function findResultsObject(
  manifest: RunManifest,
  resultsObjectId: string,
): RunResultsObject | undefined {
  return manifest.resultsObjects.find((ro) => ro.id === resultsObjectId);
}

function findModule(
  manifest: RunManifest,
  moduleId: string,
): RunModule | undefined {
  return manifest.modules.find((m) => m.id === moduleId);
}

function viewsFor(ctx: RunReadContext, resultsObjectId: string): ParquetView[] {
  const views: ParquetView[] = [];
  const ro = findResultsObject(ctx.manifest, resultsObjectId);
  if (ro?.hasParquet) {
    views.push({
      viewName: getResultsObjectTableName(resultsObjectId),
      parquetPath: runResultsObjectParquetPath(ctx.runDir, ro.moduleId, ro.id),
    });
  }
  for (const table of ["facilities_hmis", "facilities_hfa"]) {
    if (ctx.manifest.inputFiles.includes(`inputs/${table}.parquet`)) {
      views.push({
        viewName: table,
        parquetPath: runInputFilePath(ctx.runDir, `${table}.parquet`),
      });
    }
  }
  return views;
}

function executorFor(
  ctx: RunReadContext,
  resultsObjectId: string,
): SqlRowsExecutor {
  return (sql) => executeSqlOverParquet(viewsFor(ctx, resultsObjectId), sql);
}

// RO columns answer from the manifest stamp; anything else (facilities) is a
// probe against the run's own parquet — still run-local, never live.
function columnExistsFor(
  ctx: RunReadContext,
  resultsObjectId: string,
): (tableName: string, columnName: string) => Promise<boolean> {
  const execute = executorFor(ctx, resultsObjectId);
  return async (tableName, columnName) => {
    if (tableName === getResultsObjectTableName(resultsObjectId)) {
      const ro = findResultsObject(ctx.manifest, resultsObjectId);
      return ro?.columns.some((c) => c.name === columnName) ?? false;
    }
    try {
      await execute(`SELECT ${columnName} FROM ${tableName} LIMIT 1`);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (
        message.includes(
          `Binder Error: Referenced column "${columnName}" not found`,
        )
      ) {
        return false;
      }
      throw e;
    }
  };
}

function buildQueryContextFromManifest(
  manifest: RunManifest,
  ro: RunResultsObject,
  fetchConfig: GenericLongFormFetchConfig,
  datasetFamily: DatasetType | undefined,
): QueryContext {
  const facilityConfig = manifest.facilityColumnsConfig;
  const enabledFacilityColumns =
    getEnabledOptionalFacilityColumns(facilityConfig);
  const facilityContext = computeFacilityContext(
    fetchConfig,
    enabledFacilityColumns,
  );
  const columnNames = new Set(ro.columns.map((c) => c.name));
  const hasPeriodId = columnNames.has("period_id");
  const hasQuarterId = !hasPeriodId && columnNames.has("quarter_id");
  const neededPeriodColumns = detectNeededPeriodColumns(fetchConfig);
  const needsPeriodCTE = needsPeriodCTEFor({
    hasPeriodId,
    hasQuarterId,
    neededPeriodColumns,
    calendar: manifest.calendar,
  });
  return {
    datasetFamily,
    hasPeriodId,
    hasQuarterId,
    calendar: manifest.calendar,
    facilityConfig,
    enabledFacilityColumns,
    ...facilityContext,
    neededPeriodColumns,
    needsPeriodCTE,
  };
}

// ── Indicator metadata from run inputs ───────────────────────────────────────

const hfaIndicatorRow = z.object({
  var_name: z.string(),
  short_label: z.string(),
  definition: z.string(),
  type: z.string(),
  aggregation: z.string(),
  sort_order: z.number(),
});
const labeledRow = z.object({
  id: z.string(),
  label: z.string(),
  sort_order: z.number(),
});
const icehIndicatorRow = z.object({
  iceh_indicator: z.string(),
  indicator_name: z.string(),
  category: z.string(),
  sort_order: z.number(),
});
const indicatorRow = z.object({
  indicator_common_id: z.string().nullable(),
  indicator_common_label: z.string().nullable(),
});
const calculatedIndicatorRow = z.object({
  calculated_indicator_id: z.string(),
  label: z.string(),
  group_label: z.string(),
  sort_order: z.number(),
  format_as: z.enum(["percent", "number", "rate_per_10k"]),
  threshold_direction: z.enum(["higher_is_better", "lower_is_better"]),
  threshold_green: z.number(),
  threshold_yellow: z.number(),
});

async function readInputRows<T>(
  ctx: RunReadContext,
  fileName: string,
  rowSchema: z.ZodType<T>,
): Promise<T[]> {
  if (!ctx.manifest.inputFiles.includes(`inputs/${fileName}`)) return [];
  const raw = await readRunInputJsonCached(ctx.runId, fileName);
  return z.array(rowSchema).parse(raw);
}

// Mirrors getIndicatorMetadata (get_indicator_metadata.ts) over the run's
// input files, including its per-branch ORDER BYs (re-sorted in TS).
export async function getIndicatorMetadataFromRun(
  ctx: RunReadContext,
  moduleId: string,
): Promise<IndicatorMetadata[]> {
  const metadata: IndicatorMetadata[] = [];
  const mod = findModule(ctx.manifest, moduleId);
  if (!mod) return metadata;

  const datasetTypes = getDatasetTypes(mod.moduleDefinition);
  const isHfaModule = (() => {
    try {
      return JSON.parse(mod.moduleDefinition).scriptGenerationType === "hfa";
    } catch {
      return false;
    }
  })();
  const isIcehModule = datasetTypes.includes("iceh");

  if (isHfaModule) {
    const hfaIndicators = (
      await readInputRows(ctx, "hfa_indicators_snapshot.json", hfaIndicatorRow)
    ).sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.var_name.localeCompare(b.var_name),
    );
    for (const row of hfaIndicators) {
      metadata.push({
        id: row.var_name,
        label: composeHfaIndicatorLabel(
          { shortLabel: row.short_label, definition: row.definition },
          "compact",
        ),
        format_as: getHfaIndicatorMeasure(
          row.type as HfaIndicatorType,
          row.aggregation as HfaIndicatorAggregation,
        ).kind,
        sort_order: row.sort_order,
      });
    }
    for (const fileName of [
      "hfa_indicator_categories_snapshot.json",
      "hfa_indicator_sub_categories_snapshot.json",
      "hfa_indicator_service_categories_snapshot.json",
    ]) {
      const rows = (await readInputRows(ctx, fileName, labeledRow)).sort(
        (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
      );
      for (const row of rows) {
        metadata.push({
          id: row.id,
          label: row.label,
          sort_order: row.sort_order,
        });
      }
    }
    return metadata;
  }

  if (isIcehModule) {
    const icehIndicators = (
      await readInputRows(ctx, "iceh_indicators_snapshot.json", icehIndicatorRow)
    ).sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.iceh_indicator.localeCompare(b.iceh_indicator),
    );
    for (const ind of icehIndicators) {
      metadata.push({
        id: ind.iceh_indicator,
        label: ind.indicator_name,
        format_as: "percent",
        group_label: ind.category,
        sort_order: ind.sort_order,
      });
    }
    for (const [stratCode, info] of Object.entries(ICEH_STRAT_INFO)) {
      metadata.push({
        id: stratCode,
        label: info.label,
        sort_order: info.sortOrder,
      });
      if (info.levels) {
        for (const [levelCode, levelLabel] of Object.entries(info.levels)) {
          metadata.push({
            id: levelCode,
            label: levelLabel,
          });
        }
      }
    }
    return metadata;
  }

  const rawIndicators = await readInputRows(ctx, "indicators.json", indicatorRow);
  for (const ind of rawIndicators) {
    if (ind.indicator_common_id && ind.indicator_common_label) {
      metadata.push({
        id: ind.indicator_common_id,
        label: ind.indicator_common_label,
      });
    }
  }

  const snapshot = (
    await readInputRows(
      ctx,
      "calculated_indicators_snapshot.json",
      calculatedIndicatorRow,
    )
  ).sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.calculated_indicator_id.localeCompare(b.calculated_indicator_id),
  );
  const metadataById = new Map(metadata.map((m) => [m.id, m]));
  for (const ci of snapshot) {
    metadataById.set(ci.calculated_indicator_id, {
      id: ci.calculated_indicator_id,
      label: ci.label,
      format_as: ci.format_as,
      threshold_direction: ci.threshold_direction,
      threshold_green: ci.threshold_green,
      threshold_yellow: ci.threshold_yellow,
      group_label: ci.group_label,
      sort_order: ci.sort_order,
    });
  }
  return Array.from(metadataById.values());
}

// ── Metric resolution from the manifest ──────────────────────────────────────

// Mirrors enrichMetric (metric_enricher.ts) with the manifest stamps standing
// in for the live column probes.
export function enrichMetricFromManifest(
  metric: RunMetric,
  ro: RunResultsObject | undefined,
): ResultsValue {
  const requiredOptions = z
    .array(disaggregationOption)
    .parse(JSON.parse(metric.required_disaggregation_options));
  const disaggregationOptions = (ro?.availableDisaggregationOptions ?? []).map(
    (value) => ({
      value,
      isRequired: requiredOptions.includes(value),
      allowedPresentationOptions:
        getDisaggregationAllowedPresentationOptions(value),
    }),
  );
  return {
    id: metric.id,
    resultsObjectId: metric.results_object_id,
    valueProps: z.array(z.string()).parse(JSON.parse(metric.value_props)),
    valueFunc: metric.value_func as ResultsValue["valueFunc"],
    hasFacilityLevelRows: ro?.hasFacilityId ?? false,
    postAggregationExpression: metric.post_aggregation_expression
      ? postAggregationExpressionStrict.parse(
          JSON.parse(metric.post_aggregation_expression),
        )
      : undefined,
    valueLabelReplacements: metric.value_label_replacements
      ? z
          .record(z.string(), z.string())
          .parse(JSON.parse(metric.value_label_replacements))
      : undefined,
    label: metric.label,
    variantLabel: metric.variant_label ?? undefined,
    formatAs: metric.format_as as "percent" | "number",
    disaggregationOptions,
    mostGranularTimePeriodColumnInResultsFile:
      inferMostGranularTimePeriodColumn(disaggregationOptions),
    aiDescription: metric.ai_description
      ? metricAIDescriptionInstalled.parse(JSON.parse(metric.ai_description))
      : undefined,
    importantNotes: metric.important_notes ?? undefined,
  };
}

export function resolveMetricFromRun(
  ctx: RunReadContext,
  metricId: string,
): APIResponseWithData<{ resultsValue: ResultsValue; moduleId: string }> {
  const metric = ctx.manifest.metrics.find((m) => m.id === metricId);
  if (!metric) {
    return { success: false, err: `Metric not found: ${metricId}` };
  }
  const ro = findResultsObject(ctx.manifest, metric.results_object_id);
  return {
    success: true,
    data: {
      resultsValue: enrichMetricFromManifest(metric, ro),
      moduleId: metric.module_id,
    },
  };
}

// ── The run-derived catalog as the client sees it (T1 store) ─────────────────

// The manifest module catalog → InstalledModuleSummary[], sorted by id — the
// project's modules ARE the attached run's modules (no live project-DB state).
export function getModuleSummariesFromManifest(
  manifest: RunManifest,
): InstalledModuleSummary[] {
  return manifest.modules
    .map<InstalledModuleSummary>((mod) => {
      const def = parseInstalledModuleDefinition(mod.moduleDefinition);
      return {
        id: getValidatedModuleId(mod.id),
        label: def.label,
        hasParameters: (def.configRequirements?.parameters?.length ?? 0) > 0,
        lastRunAt: mod.lastRunAt,
        lastRunGitRef: mod.lastRunGitRef ?? undefined,
        moduleDefinitionResultsObjectIds: manifest.resultsObjects
          .filter((ro) => ro.moduleId === mod.id)
          .map((ro) => ro.id),
      };
    })
    .toSorted((a, b) => a.id.toLowerCase().localeCompare(b.id.toLowerCase()));
}

// Metric status = the finalize-computed availability stamp (§2.2); readers
// never re-derive availability, and unavailable metrics surface the stamped
// reason.
export function getMetricsWithStatusFromManifest(
  manifest: RunManifest,
): MetricWithStatus[] {
  const stampById = new Map(
    manifest.metricAvailability.map((a) => [a.metricId, a]),
  );
  return manifest.metrics
    .filter((metric) => !metric.hide)
    .map<MetricWithStatus>((metric) => {
      const ro = findResultsObject(manifest, metric.results_object_id);
      const stamp = stampById.get(metric.id);
      const available = stamp?.status === "available";
      return {
        ...enrichMetricFromManifest(metric, ro),
        status: available ? "ready" : "unavailable",
        statusReason: available
          ? undefined
          : (stamp?.reason ?? "No availability stamp in this run"),
        moduleId: metric.module_id as ModuleId,
        vizPresets: metric.viz_presets
          ? z.array(vizPresetInstalled).parse(JSON.parse(metric.viz_presets))
          : undefined,
      };
    })
    .toSorted((a, b) => a.label.localeCompare(b.label));
}

export function getModuleWithConfigSelectionsFromManifest(
  manifest: RunManifest,
  moduleId: string,
): APIResponseWithData<InstalledModuleWithConfigSelections> {
  const mod = findModule(manifest, moduleId);
  if (!mod) {
    return { success: false, err: `Module not in this run: ${moduleId}` };
  }
  const def = parseInstalledModuleDefinition(mod.moduleDefinition);
  return {
    success: true,
    data: {
      id: getValidatedModuleId(mod.id),
      label: def.label,
      configSelections: mod.configSelections
        ? parseModuleConfigSelections(mod.configSelections)
        : getStartingModuleConfigSelections(def.configRequirements),
    },
  };
}

export function getDatasetFamilyFromRun(
  ctx: RunReadContext,
  moduleId: string,
): DatasetType | undefined {
  const mod = findModule(ctx.manifest, moduleId);
  return mod ? getDatasetFamily(mod.moduleDefinition) : undefined;
}

export function getModuleIdForResultsObjectFromRun(
  ctx: RunReadContext,
  resultsObjectId: string,
): string | undefined {
  return findResultsObject(ctx.manifest, resultsObjectId)?.moduleId;
}

export function getModuleIdForMetricFromRun(
  ctx: RunReadContext,
  metricId: string,
): string | undefined {
  return ctx.manifest.metrics.find((m) => m.id === metricId)?.module_id;
}

export function getRunVersionInfo(
  ctx: RunReadContext,
  moduleId: string,
): { moduleLastRun: string; datasetsVersion: string; runId: string } {
  return versionInfoFor(ctx, moduleId);
}

// PO row (authored content) stays on the project DB; only the resultsValue
// resolution comes from the run. No row → the id may be a virtual default
// (item 5b): a manifest preset projection, derived here with the run as its
// whole identity.
export async function getPresentationObjectDetailFromRun(
  ctx: RunReadContext,
  projectId: string,
  projectDb: Sql,
  presentationObjectId: string,
): Promise<APIResponseWithData<PresentationObjectDetail>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawPresObj = (
      await projectDb<
        {
          id: string;
          metric_id: string;
          last_updated: string;
          label: string;
          config: string;
          is_default_visualization: boolean;
          folder_id: string | null;
        }[]
      >`
SELECT * FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);
    if (rawPresObj === undefined) {
      const virtual = findVirtualDefault(ctx.manifest, presentationObjectId);
      if (virtual === undefined) {
        throw new Error("No presentation object with this id");
      }
      const resVirtualValue = resolveMetricFromRun(ctx, virtual.metricId);
      throwIfErrWithData(resVirtualValue);
      const virtualDetail: PresentationObjectDetail = {
        id: virtual.id,
        projectId,
        resultsValue: resVirtualValue.data.resultsValue,
        lastUpdated: VIRTUAL_DEFAULT_LAST_UPDATED,
        label: virtual.label,
        config: virtual.config,
        isDefault: true,
        folderId: null,
        runId: ctx.runId,
      };
      return { success: true, data: virtualDetail };
    }
    const resResultsValue = resolveMetricFromRun(ctx, rawPresObj.metric_id);
    throwIfErrWithData(resResultsValue);
    const presObj: PresentationObjectDetail = {
      id: rawPresObj.id,
      projectId,
      resultsValue: resResultsValue.data.resultsValue,
      lastUpdated: rawPresObj.last_updated,
      label: rawPresObj.label,
      config: parsePresentationObjectConfig(rawPresObj.config),
      isDefault: rawPresObj.is_default_visualization,
      folderId: rawPresObj.folder_id,
      runId: ctx.runId,
    };
    return { success: true, data: presObj };
  });
}

function versionInfoFor(ctx: RunReadContext, moduleId: string) {
  const mod = findModule(ctx.manifest, moduleId);
  return {
    moduleLastRun: mod?.lastRunAt ?? "unknown",
    datasetsVersion: datasetsVersionFromManifest(ctx.manifest),
    runId: ctx.runId,
  };
}

// ── The read functions ───────────────────────────────────────────────────────

export async function getPresentationObjectItemsFromRun(
  ctx: RunReadContext,
  projectId: string,
  resultsObjectId: string,
  fetchConfig: GenericLongFormFetchConfig,
  firstPeriodOption: PeriodOption | undefined,
): Promise<APIResponseWithData<ItemsHolderPresentationObject>> {
  const ro = findResultsObject(ctx.manifest, resultsObjectId);
  if (!ro) {
    return {
      success: false,
      err: `Unknown results object: ${resultsObjectId}`,
    };
  }
  const datasetFamily = getDatasetFamilyFromRun(ctx, ro.moduleId);
  const queryContext = buildQueryContextFromManifest(
    ctx.manifest,
    ro,
    fetchConfig,
    datasetFamily,
  );
  return await getPresentationObjectItemsCore(
    {
      execute: executorFor(ctx, resultsObjectId),
      columnExists: columnExistsFor(ctx, resultsObjectId),
      getIndicatorMetadata: () => getIndicatorMetadataFromRun(ctx, ro.moduleId),
    },
    projectId,
    resultsObjectId,
    getResultsObjectTableName(resultsObjectId),
    queryContext,
    fetchConfig,
    firstPeriodOption,
    versionInfoFor(ctx, ro.moduleId),
  );
}

export async function getPossibleValuesFromRun(
  ctx: RunReadContext,
  resultsObjectId: string,
  disaggregationOptionValue: Parameters<typeof getPossibleValuesCore>[3],
  labelMap: Map<string, string>,
  filters: GenericLongFormFetchConfig["filters"],
  periodFilterExactBounds?: PeriodBounds,
): Promise<APIResponseWithData<{ id: string; label: string }[]>> {
  const ro = findResultsObject(ctx.manifest, resultsObjectId);
  if (!ro) {
    return {
      success: false,
      err: `Unknown results object: ${resultsObjectId}`,
    };
  }
  const datasetFamily = getDatasetFamilyFromRun(ctx, ro.moduleId);
  const fetchConfig = buildMinimalFetchConfig(
    disaggregationOptionValue,
    filters,
    periodFilterExactBounds,
  );
  const queryContext = buildQueryContextFromManifest(
    ctx.manifest,
    ro,
    fetchConfig,
    datasetFamily,
  );
  return await getPossibleValuesCore(
    {
      execute: executorFor(ctx, resultsObjectId),
      columnExists: columnExistsFor(ctx, resultsObjectId),
    },
    queryContext,
    getResultsObjectTableName(resultsObjectId),
    disaggregationOptionValue,
    labelMap,
    filters,
    periodFilterExactBounds,
  );
}

export async function getResultsValueInfoFromRun(
  ctx: RunReadContext,
  projectId: string,
  metricId: string,
): Promise<APIResponseWithData<ResultsValueInfoForPresentationObject>> {
  const resResultsValue = resolveMetricFromRun(ctx, metricId);
  if (resResultsValue.success === false) {
    return resResultsValue;
  }
  const { resultsValue, moduleId } = resResultsValue.data;
  const resultsObjectId = resultsValue.resultsObjectId;
  const ro = findResultsObject(ctx.manifest, resultsObjectId);

  const indicatorMetadata = await getIndicatorMetadataFromRun(ctx, moduleId);
  const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));

  return await buildResultsValueInfo(
    projectId,
    metricId,
    resultsObjectId,
    versionInfoFor(ctx, moduleId),
    ro?.periodBounds ?? undefined,
    resultsValue.disaggregationOptions.map((d) => d.value),
    (disOpt) => getPossibleValuesFromRun(ctx, resultsObjectId, disOpt, labelMap, []),
  );
}

// Raw no-filter bounds for the replicant-options route — the manifest stamp
// IS the no-filter MIN/MAX of the physical time column.
export function getRawPeriodBoundsFromRun(
  ctx: RunReadContext,
  resultsObjectId: string,
): PeriodBounds | undefined {
  return findResultsObject(ctx.manifest, resultsObjectId)?.periodBounds ??
    undefined;
}

// Raw-rows preview (S8 read surface) over the run's query parquet.
export async function getResultsObjectItemsFromRun(
  ctx: RunReadContext,
  resultsObjectId: string,
  limit: number | undefined,
): Promise<APIResponseWithData<ItemsHolderResultsObject>> {
  return await tryCatchDatabaseAsync(async () => {
    const ro = findResultsObject(ctx.manifest, resultsObjectId);
    if (!ro || !ro.hasParquet) {
      return {
        success: false as const,
        err: `No query data for results object ${resultsObjectId} in this run`,
      };
    }
    const tableName = getResultsObjectTableName(resultsObjectId);
    const rawItems = await executorFor(ctx, resultsObjectId)(
      `SELECT * FROM ${tableName}${limit ? ` LIMIT ${Math.floor(limit)}` : ""}`,
    );
    if (rawItems.length === 0) {
      return {
        success: true as const,
        data: { status: "no_data_available" as const },
      };
    }
    return {
      success: true as const,
      data: {
        status: "ok" as const,
        totalCount: ro.rowCount,
        items: rawItems as Record<string, string>[],
      },
    };
  });
}
