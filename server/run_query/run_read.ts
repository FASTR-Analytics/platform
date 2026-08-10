import { z } from "zod";
import type { Sql } from "postgres";
import {
  composeHfaIndicatorLabel,
  disaggregationOption,
  getDatasetFamily,
  getDisaggregationAllowedPresentationOptions,
  getEnabledOptionalFacilityColumns,
  getHfaIndicatorMeasure,
  getStartingModuleConfigSelections,
  getValidatedModuleId,
  metricAIDescriptionInstalled,
  parseInstalledModuleDefinition,
  parsePresentationObjectConfig,
  postAggregationExpressionStrict,
  throwIfErrWithData,
  vizPresetInstalled,
  type APIResponseWithData,
  type DatasetInProject,
  type DatasetType,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  type HfaIndicatorAggregation,
  type HfaIndicatorType,
  type HfaTaxonomyForAI,
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
  computeFacilityContext,
  facilitiesTableForFamily,
} from "../server_only_funcs_presentation_objects/get_query_context.ts";
import {
  buildMinimalFetchConfig,
  getPossibleValuesCore,
} from "../server_only_funcs_presentation_objects/get_possible_values.ts";
import { getPresentationObjectItemsCore } from "../server_only_funcs_presentation_objects/get_presentation_object_items.ts";
import {
  buildResultsValueInfo,
  indicatorFormatsFrom,
} from "../server_only_funcs_presentation_objects/get_results_value_info.ts";
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
  // Mirrors buildQueryContext's getTextColumnNames: both sides of the join,
  // from the manifest stamps instead of information_schema probes.
  const textColumns = new Set(
    ro.columns.filter((c) => c.duckDbType === "VARCHAR").map((c) => c.name),
  );
  if (facilityContext.needsFacilityJoin) {
    const facilitiesTable = manifest.facilitiesTables.find(
      (t) => t.tableName === facilitiesTableForFamily(datasetFamily),
    );
    for (const col of facilitiesTable?.columns ?? []) {
      if (col.duckDbType === "VARCHAR") textColumns.add(col.name);
    }
  }
  return {
    textColumns,
    datasetFamily,
    hasFacilityId: ro.hasFacilityId,
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
// The taxonomy projection needs the category links the metadata reader
// doesn't; both read the same captured hfa_indicators_snapshot.json.
// variant_group_id is optional: packages captured before the variant feature
// lack the key.
const hfaTaxonomyIndicatorRow = hfaIndicatorRow.extend({
  category_id: z.string().nullable(),
  sub_category_id: z.string().nullable(),
  service_category_ids: z.unknown(),
  variant_group_id: z.string().nullable().optional(),
});
const hfaSubCategoryRow = labeledRow.extend({
  category_id: z.string(),
});
const hfaVariantItemRow = labeledRow.extend({
  group_id: z.string(),
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
// The input-mirror readers need only identity + manifest, so the wizard can
// call them on a run it just built (before any read context exists).
export type RunInputSource = { runId: string; manifest: RunManifest };

async function readInputRows<T>(
  ctx: RunInputSource,
  fileName: string,
  rowSchema: z.ZodType<T>,
): Promise<T[]> {
  if (!ctx.manifest.inputFiles.includes(`inputs/${fileName}`)) return [];
  const raw = await readRunInputJsonCached(ctx.runId, fileName);
  return z.array(rowSchema).parse(raw);
}

// The project-level dataset/indicator lists that T1 carries, all served from
// the attached run's own inputs (PLAN_RESULTS_RUNS Phase 3 re-cut ruling 5 —
// the project mirror tables are no longer written, so they are never read).

export function getProjectDatasetsFromManifest(
  manifest: RunManifest,
): DatasetInProject[] {
  return manifest.datasets.map((d) => ({
    datasetType: d.datasetType,
    info: d.info,
    dateExported: d.lastUpdated,
  } as DatasetInProject));
}

export async function getCommonIndicatorsFromManifestInputs(
  ctx: RunInputSource,
): Promise<{ id: string; label: string }[]> {
  const rows = await readInputRows(ctx, "indicators.json", indicatorRow);
  return rows
    .flatMap((r) =>
      r.indicator_common_id && r.indicator_common_label
        ? [{ id: r.indicator_common_id, label: r.indicator_common_label }]
        : []
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function getIcehIndicatorsFromManifestInputs(
  ctx: RunInputSource,
): Promise<{ id: string; label: string; category: string }[]> {
  const rows = await readInputRows(
    ctx,
    "iceh_indicators_snapshot.json",
    icehIndicatorRow,
  );
  return rows
    .toSorted(
      (a, b) =>
        a.sort_order - b.sort_order ||
        a.iceh_indicator.localeCompare(b.iceh_indicator),
    )
    .map((r) => ({
      id: r.iceh_indicator,
      label: r.indicator_name,
      category: r.category,
    }));
}

// The AI's HFA taxonomy, from the run's captured indicator/category mirrors.
// Time points stay instance-wide (they are not run content).
export async function getHfaTaxonomyFromManifestInputs(
  ctx: RunInputSource,
  timePoints: { id: string; label: string; periodId: string }[],
): Promise<HfaTaxonomyForAI> {
  const [indicators, categories, subCategories, serviceCategories, variantGroups, variantItems] =
    await Promise.all([
      readInputRows(ctx, "hfa_indicators_snapshot.json", hfaTaxonomyIndicatorRow),
      readInputRows(ctx, "hfa_indicator_categories_snapshot.json", labeledRow),
      readInputRows(
        ctx,
        "hfa_indicator_sub_categories_snapshot.json",
        hfaSubCategoryRow,
      ),
      readInputRows(
        ctx,
        "hfa_indicator_service_categories_snapshot.json",
        labeledRow,
      ),
      readInputRows(
        ctx,
        "hfa_indicator_variant_groups_snapshot.json",
        labeledRow,
      ),
      readInputRows(
        ctx,
        "hfa_indicator_variant_items_snapshot.json",
        hfaVariantItemRow,
      ),
    ]);
  return {
    categories: categories
      .toSorted((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ id: c.id, label: c.label })),
    subCategories: subCategories
      .toSorted((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ id: s.id, categoryId: s.category_id, label: s.label })),
    serviceCategories: serviceCategories
      .toSorted((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ id: s.id, label: s.label })),
    variantGroups: variantGroups
      .toSorted((a, b) => a.sort_order - b.sort_order)
      .map((g) => ({ id: g.id, label: g.label })),
    variantItems: variantItems
      .toSorted((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ id: i.id, groupId: i.group_id, label: i.label })),
    timePoints,
    indicators: indicators
      .toSorted((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        id: i.var_name,
        label: composeHfaIndicatorLabel(
          { shortLabel: i.short_label, definition: i.definition },
          "full",
        ),
        measure: getHfaIndicatorMeasure(
          i.type as HfaIndicatorType,
          i.aggregation as HfaIndicatorAggregation,
        ).label.en,
        categoryId: i.category_id,
        subCategoryId: i.sub_category_id,
        serviceCategoryIds: parseServiceCategoryIds(i.service_category_ids),
        variantGroupId: i.variant_group_id ?? null,
      })),
  };
}

function parseServiceCategoryIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as string[] : [];
    } catch {
      return [];
    }
  }
  return [];
}

// A manifest lookup, not a derivation: the catalog is stamped at finalize by
// buildRunIndicatorCatalog (server/runs/indicator_catalog.ts) and recomputed
// forward by manifest transform block 1. Nothing here re-reads the input
// mirrors — the manifest's "precomputed, never probed" doctrine.
//
// An empty array for an unknown module is the same answer the derivation gave
// (it returned early on a module missing from the catalog).
export function getIndicatorMetadataFromRun(
  ctx: { manifest: RunManifest },
  moduleId: string,
): IndicatorMetadata[] {
  return ctx.manifest.indicators.find((e) => e.moduleId === moduleId)
    ?.indicators ?? [];
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
    datasetFamily: metric.datasetFamily ?? undefined,
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
    formatAs: metric.format_as,
    disaggregationOptions,
    mostGranularTimePeriodColumnInResultsFile:
      inferMostGranularTimePeriodColumn(disaggregationOptions),
    aiDescription: metric.ai_description
      ? metricAIDescriptionInstalled.parse(JSON.parse(metric.ai_description))
      : undefined,
    importantNotes: metric.important_notes ?? undefined,
  };
}

// Server-side requiredness guard for the type-erased items request: the
// client sends only fetchConfig, so the viz type is unknown here and two
// gaps are structural. Time-based required dims (restricted
// allowedPresentationOptions) are exempt — a map legitimately omits
// time_point under current policy. And metrics sharing an RO may require
// different dims (m9 strat/level), so only dims required by EVERY metric of
// the RO are enforceable from the RO id alone. App clients and the AI tools
// always send required dims grouped; this guards hand-crafted requests,
// whose pooled aggregates would otherwise be silently wrong.
export function findMissingRequiredGroupBys(
  ctx: RunReadContext,
  resultsObjectId: string,
  groupBys: string[],
): DisaggregationOption[] {
  const requiredSets = ctx.manifest.metrics
    .filter((m) => m.results_object_id === resultsObjectId)
    .map((m) =>
      z
        .array(disaggregationOption)
        .parse(JSON.parse(m.required_disaggregation_options)),
    );
  if (requiredSets.length === 0) return [];
  const [first, ...rest] = requiredSets;
  return first.filter(
    (d) =>
      rest.every((s) => s.includes(d)) &&
      getDisaggregationAllowedPresentationOptions(d) === undefined &&
      !groupBys.includes(d),
  );
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
  // No parquet in the package (module never produced this output): the view
  // is never created, so without this guard the query surfaces a raw DuckDB
  // catalog error. Same user-facing text as the legacy classifier's
  // ro_-relation case (error_classifier.ts) so both planes degrade alike.
  if (!ro.hasParquet) {
    return {
      success: false,
      err:
        "The data for this visualization is not available. The module may need to be run. Run the module to generate the required data.",
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
      getIndicatorMetadata: () =>
        Promise.resolve(getIndicatorMetadataFromRun(ctx, ro.moduleId)),
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
  // No parquet in the package (module never produced this output): the view
  // is never created, so without this guard the query surfaces a raw DuckDB
  // catalog error. Same user-facing text as the legacy classifier's
  // ro_-relation case (error_classifier.ts) so both planes degrade alike.
  if (!ro.hasParquet) {
    return {
      success: false,
      err:
        "The data for this visualization is not available. The module may need to be run. Run the module to generate the required data.",
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

  const indicatorMetadata = getIndicatorMetadataFromRun(ctx, moduleId);
  const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));

  return await buildResultsValueInfo(
    projectId,
    metricId,
    resultsObjectId,
    versionInfoFor(ctx, moduleId),
    ro?.periodBounds ?? undefined,
    resultsValue.disaggregationOptions.map((d) => d.value),
    indicatorFormatsFrom(indicatorMetadata),
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
