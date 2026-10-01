import { z } from "zod";
import type { Sql } from "postgres";
import {
  type APIResponseWithData,
  canUseScope,
  catalogExpressionEvaluationStrict,
  compareModules,
  composeHfaIndicatorLabel,
  convertPeriodValue,
  type DatasetType,
  type DisaggregationOption,
  disaggregationOption,
  type GenericLongFormFetchConfig,
  getDisaggregationAllowedPresentationOptions,
  getEnabledOptionalFacilityColumns,
  getHfaIndicatorMeasure,
  getStartingModuleConfigSelections,
  type HfaIndicatorAggregation,
  type HfaIndicatorType,
  type IndicatorMetadata,
  type InstalledModuleSummary,
  type InstalledModuleWithConfigSelections,
  type ItemsHolderPresentationObject,
  type ItemsHolderResultsObject,
  metricAIDescriptionInstalled,
  type MetricWithStatus,
  moduleDefinitionInstalledStrict,
  parseInstalledModuleDefinition,
  parsePresentationObjectConfig,
  type PeriodBounds,
  type PeriodOption,
  postAggregationExpressionStrict,
  type ResultsValue,
  type ResultsValueInfoForPresentationObject,
  type RunAuthoringContextHfaTaxonomy,
  type RunDataset,
  type RunManifest,
  type RunMetric,
  type RunModule,
  type RunResultsObject,
  SCOPE_INDICATOR_COLUMN,
  type ScopeAccess,
  type ScopeDefinition,
  scopeDefinitionHash,
  throwIfErrWithData,
  toIndicatorMetadataDisplay,
  vizPresetInstalled,
  type YearRange,
} from "lib";
import {
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "../db/utils.ts";
import { getScope } from "../db/instance/scopes.ts";
import { parseModuleConfigSelections } from "../runs/module_config.ts";
import {
  getRunManifestCached,
  readRunInputJsonCached,
} from "../runs/manifest_cache.ts";
import {
  isRunIdShape,
  runDirPath,
  runInputFilePath,
  runResultsObjectParquetPath,
} from "../runs/run_paths.ts";
import {
  buildMinimalFetchConfig,
  buildResultsValueInfo,
  computeFacilityContext,
  detectNeededPeriodColumns,
  facilitiesTableForFamily,
  getPossibleValuesCore,
  getPresentationObjectItemsCore,
  indicatorFormatsFrom,
  indicatorRulesFrom,
  needsPeriodCTEFor,
  type QueryContext,
  type RunVersionInfo,
  type SqlRowsExecutor,
} from "../server_only_funcs_presentation_objects/mod.ts";
import {
  applyCatalogExpressionsToItems,
  getCatalogEvaluationForResultsObject,
} from "./catalog_expression_items.ts";
import {
  escapeSqlLiteral,
  executeSqlOverParquet,
  type ParquetView,
} from "./duckdb_executor.ts";

// The run read path: every function here consults ONLY the immutable run:
// manifest for metadata (no probes), parquet for data. The SQL builders
// and status logic live in server_only_funcs_presentation_objects/ and take
// the query context and the executor from here.

export type RunReadContext = {
  runId: string;
  runDir: string;
  manifest: RunManifest;
  // The resolved scope definition. Every view a read runs against is built
  // under it (viewsFor). `scopeToken` is its hash, the cache-key segment.
  scope: ScopeDefinition;
  scopeToken: string;
};

// The lenses onto one read core. A read context is (run, scope). The DATA
// lens (getReadyRunReadContext) takes both halves from the caller, the
// (runId, scopeId) pair a product carries, and gates on a ready package:
// every run-keyed figure-data route uses it. The manifest lens
// (getRunReadContextForRun) has no ready gate: the authoring context uses it.
// Both take the scope from the caller, and no context exists without one.
// Everything below the context is shared.

async function buildRunReadContext(
  runId: string,
  scope: ScopeDefinition,
): Promise<RunReadContext> {
  const manifest = await getRunManifestCached(runId);
  return {
    runId,
    runDir: runDirPath(runId),
    manifest,
    scope,
    scopeToken: scopeDefinitionHash(scope),
  };
}

export const SCOPE_NOT_GRANTED = "You do not have access to this scope";

// A scope id names a `scopes` row. An unknown id fails as SCOPE_NOT_FOUND
// before the grant is asked, and a restricted caller is refused every scope it
// does not hold.
async function loadScopeDefinition(
  mainDb: Sql,
  scopeId: string,
  access: ScopeAccess,
): Promise<APIResponseWithData<ScopeDefinition>> {
  const scopeRes = await getScope(mainDb, scopeId);
  if (scopeRes.success === false) return scopeRes;
  return canUseScope(access, scopeId)
    ? { success: true, data: scopeRes.data.definition }
    : { success: false, err: SCOPE_NOT_GRANTED };
}

// The manifest alone, for a read that serves no data and so needs no scope.
// The run id arrives over the wire and becomes a path, so it is shape-checked
// first; an unreadable or unknown run surfaces as the manifest read failing.
export async function getRunManifestForRun(
  runId: string,
): Promise<APIResponseWithData<RunManifest>> {
  if (!isRunIdShape(runId)) {
    return { success: false, err: "Invalid results package id" };
  }
  try {
    return { success: true, data: await getRunManifestCached(runId) };
  } catch (e) {
    return {
      success: false,
      err: `Results run unavailable: ${e instanceof Error ? e.message : e}`,
    };
  }
}

// The manifest lens, shape-checked and failing as getRunManifestForRun does.
export async function getRunReadContextForRun(
  mainDb: Sql,
  runId: string,
  scopeId: string,
  access: ScopeAccess,
): Promise<APIResponseWithData<RunReadContext>> {
  if (!isRunIdShape(runId)) {
    return { success: false, err: "Invalid results package id" };
  }
  try {
    const scopeRes = await loadScopeDefinition(mainDb, scopeId, access);
    if (scopeRes.success === false) return scopeRes;
    return {
      success: true,
      data: await buildRunReadContext(runId, scopeRes.data),
    };
  } catch (e) {
    return {
      success: false,
      err: `Results run unavailable: ${e instanceof Error ? e.message : e}`,
    };
  }
}

// The data lens. Both halves arrive over the wire: the run id becomes a path
// (shape-checked here) and the scope id names a `scopes` row whose definition
// is loaded here. The definition's values become
// SQL literals (escaped in scopePredicateFor) and its hash the cache-key
// segment. `runs.status = 'ready'` is checked against the catalog, not the
// manifest: a generating run has no manifest file at all, but a FAILED one
// can have a published partial dir, and neither may serve figures.
export async function getReadyRunReadContext(
  mainDb: Sql,
  runId: string,
  scopeId: string,
  access: ScopeAccess,
): Promise<APIResponseWithData<RunReadContext>> {
  if (!isRunIdShape(runId)) {
    return { success: false, err: "Invalid results package id" };
  }
  try {
    const row = (
      await mainDb<{ status: string }[]>`
SELECT status FROM runs WHERE id = ${runId}
`
    ).at(0);
    if (row === undefined) {
      return { success: false, err: "Results package not found" };
    }
    if (row.status !== "ready") {
      return { success: false, err: "This results package is not ready" };
    }
    const scopeRes = await loadScopeDefinition(mainDb, scopeId, access);
    if (scopeRes.success === false) return scopeRes;
    return {
      success: true,
      data: await buildRunReadContext(runId, scopeRes.data),
    };
  } catch (e) {
    return {
      success: false,
      err: `Results run unavailable: ${e instanceof Error ? e.message : e}`,
    };
  }
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

// The scope is enforced here and nowhere else: each view is the parquet under
// the scope's predicate, so a query built above the executor cannot read
// outside it. Each facilities view takes the area of its own family's section,
// and comes first because a results object's predicate may read one.
function viewsFor(ctx: RunReadContext, resultsObjectId: string): ParquetView[] {
  const views: ParquetView[] = [];
  for (const table of FACILITIES_TABLES) {
    if (hasFacilitiesParquet(ctx.manifest, table)) {
      views.push({
        viewName: table,
        parquetPath: runInputFilePath(ctx.runDir, `${table}.parquet`),
        predicate: facilitiesPredicate(ctx.scope[FACILITIES_FAMILY[table]]),
      });
    }
  }
  const ro = findResultsObject(ctx.manifest, resultsObjectId);
  if (ro?.hasParquet) {
    views.push({
      viewName: getResultsObjectTableName(resultsObjectId),
      parquetPath: runResultsObjectParquetPath(ctx.runDir, ro.moduleId, ro.id),
      predicate: scopePredicateFor(ctx.scope, ro, ctx.manifest),
    });
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
// probe against the run's own parquet, still run-local, never live.
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
  // Per-family slot (manifest v5): hmis → structureSchemaHmis, hfa →
  // structureSchemaHfa, iceh/undefined → no enabled facility columns.
  const facilityConfig = datasetFamily === "hmis"
    ? manifest.structureSchemaHmis ?? undefined
    : datasetFamily === "hfa"
    ? manifest.structureSchemaHfa ?? undefined
    : undefined;
  const enabledFacilityColumns = facilityConfig
    ? getEnabledOptionalFacilityColumns(facilityConfig)
    : [];
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
  // Both sides of the join, from the manifest's column-type stamps.
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
    enabledFacilityColumns,
    ...facilityContext,
    neededPeriodColumns,
    needsPeriodCTE,
  };
}

// ── Indicator metadata from run inputs ───────────────────────────────────────

const hfaIndicatorRow = z.object({
  indicator_id: z.string(),
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

// The dataset/indicator lists a reader carries, all served from the run's
// own inputs (PLAN_RESULTS_RUNS Phase 3 re-cut ruling 5: the mirror tables
// are no longer written, so they are never read).

export function getRunDatasetsFromManifest(
  manifest: RunManifest,
): RunDataset[] {
  return manifest.datasets.map((d) => ({
    datasetType: d.datasetType,
    info: d.info,
    dateExported: d.lastUpdated,
  } as RunDataset));
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

// The HFA taxonomy, from the run's captured indicator/category mirrors. Time
// points are not run content (HFA survey rounds are instance-wide T1 state),
// so they are absent here and composed in by each consumer that needs the
// full HfaTaxonomyForAI (server/mcp/context_cache.ts).
export async function getHfaTaxonomyFromManifestInputs(
  ctx: RunInputSource,
): Promise<RunAuthoringContextHfaTaxonomy> {
  const [
    indicators,
    categories,
    subCategories,
    serviceCategories,
    variantGroups,
    variantItems,
  ] = await Promise.all([
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
    indicators: indicators
      .toSorted((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        id: i.indicator_id,
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
// mirrors: the manifest's "precomputed, never probed" doctrine.
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

// A manifest metric row → the ResultsValue the client works with, with the
// disaggregation options from the results object's finalize-time stamp.
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
      allowedPresentationOptions: getDisaggregationAllowedPresentationOptions(
        value,
      ),
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
    catalogExpressionEvaluation: metric.catalog_expression_evaluation
      ? catalogExpressionEvaluationStrict.parse(
        JSON.parse(metric.catalog_expression_evaluation),
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

function inferMostGranularTimePeriodColumn(
  disaggregationOptions: ResultsValue["disaggregationOptions"],
): PeriodOption | undefined {
  const disOpts = disaggregationOptions.map((d) => d.value);
  if (disOpts.includes("period_id")) return "period_id";
  if (disOpts.includes("quarter_id")) return "quarter_id";
  if (disOpts.includes("year")) return "year";
  return undefined;
}

// Server-side requiredness guard for the type-erased items request: the
// client sends only fetchConfig, so the viz type is unknown here and two
// gaps are structural. Time-based required dims (restricted
// allowedPresentationOptions) are exempt: a map legitimately omits
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
        .parse(JSON.parse(m.required_disaggregation_options))
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

// The manifest module catalog → InstalledModuleSummary[], in module order.
export function getModuleSummariesFromManifest(
  manifest: RunManifest,
): InstalledModuleSummary[] {
  return manifest.modules
    .map<InstalledModuleSummary>((mod) => {
      const def = parseInstalledModuleDefinition(mod.moduleDefinition);
      return {
        id: mod.id,
        label: def.label,
        family: def.family,
        tier: def.tier,
        sortOrder: def.sortOrder,
        hasParameters: (def.configRequirements?.parameters?.length ?? 0) > 0,
        lastRunAt: mod.lastRunAt,
        lastRunGitRef: mod.lastRunGitRef ?? undefined,
        moduleDefinitionResultsObjectIds: manifest.resultsObjects
          .filter((ro) => ro.moduleId === mod.id)
          .map((ro) => ro.id),
      };
    })
    .toSorted(compareModules);
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
        moduleId: metric.module_id,
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
      id: mod.id,
      label: def.label,
      configSelections: mod.configSelections
        ? parseModuleConfigSelections(mod.configSelections)
        : getStartingModuleConfigSelections(def.configRequirements),
    },
  };
}

// The declared family alone, off the per-request read path: the full blob
// (script included) is parsed only where a summary is built.
const moduleFamilyOnly = moduleDefinitionInstalledStrict.pick({ family: true });

function moduleFamilyFromDefinition(moduleDefinition: string): DatasetType {
  return moduleFamilyOnly.parse(JSON.parse(moduleDefinition)).family;
}

function datasetFamilyFromManifest(
  manifest: RunManifest,
  moduleId: string,
): DatasetType | undefined {
  const mod = findModule(manifest, moduleId);
  return mod ? moduleFamilyFromDefinition(mod.moduleDefinition) : undefined;
}

export function getDatasetFamilyFromRun(
  ctx: RunReadContext,
  moduleId: string,
): DatasetType | undefined {
  return datasetFamilyFromManifest(ctx.manifest, moduleId);
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

export function getRunVersionInfo(ctx: RunReadContext): RunVersionInfo {
  return { runId: ctx.runId, scopeToken: ctx.scopeToken };
}

// The "module has not run" guard, read off the manifest: a module absent from
// the run, or present without a run stamp, has no data to serve.
export function moduleHasRun(ctx: RunReadContext, moduleId: string): boolean {
  return findModule(ctx.manifest, moduleId)?.lastRunAt != null;
}

// ── Scope ───────────────────────────────────────────────────────────────────

const FACILITIES_TABLES = ["facilities_hmis", "facilities_hfa"] as const;

const FACILITIES_FAMILY = {
  facilities_hmis: "hmis",
  facilities_hfa: "hfa",
} as const;

function hasFacilitiesParquet(manifest: RunManifest, table: string): boolean {
  return manifest.inputFiles.includes(`inputs/${table}.parquet`);
}

// An excluded section needs no predicate here: only its own family's results
// objects read its facilities view, and their views are already empty.
function facilitiesPredicate(
  section: ScopeDefinition["hmis"] | ScopeDefinition["hfa"],
): string | undefined {
  return section.include && section.adminArea2 !== null
    ? inAreaPredicate("admin_area_2", section.adminArea2)
    : undefined;
}

// The predicate the scope puts on one results object's view. The section is
// picked by the family the object's module declares: an excluded section, or
// a module outside the section's list, empties the view. Undefined means the
// view is the whole parquet.
//
// Within the section, the default principle: a dimension filters a results
// object only when the object has a column for it, decided from the manifest
// column stamps (never from a baked list, a new module can add a results
// object of any shape). Where it has none, that dimension contributes nothing
// and the object is served whole.
export function scopePredicateFor(
  definition: ScopeDefinition,
  ro: RunResultsObject,
  manifest: RunManifest,
): string | undefined {
  const family = datasetFamilyFromManifest(manifest, ro.moduleId);
  if (family === undefined) return "FALSE";
  const section = definition[family];
  if (
    !section.include ||
    (section.modules !== null && !section.modules.includes(ro.moduleId))
  ) {
    return "FALSE";
  }
  const columnNames = new Set(ro.columns.map((c) => c.name));
  const indicatorColumn = SCOPE_INDICATOR_COLUMN[family];
  const parts = [
    "adminArea2" in section
      ? geographyPredicate(
        section.adminArea2,
        `facilities_${family}`,
        columnNames,
        manifest,
      )
      : undefined,
    "years" in section ? yearsPredicate(section.years, columnNames) : undefined,
    "timePoints" in section && columnNames.has("time_point")
      ? inListPredicate("time_point", section.timePoints)
      : undefined,
    columnNames.has(indicatorColumn)
      ? inListPredicate(indicatorColumn, section.indicators)
      : undefined,
  ].filter((part) => part !== undefined);
  if (parts.includes("FALSE")) return "FALSE";
  return parts.length === 0 ? undefined : parts.join(" AND ");
}

// The cast makes one predicate serve a text column and an integer one (a
// module may declare time_point as either).
function inListPredicate(
  column: string,
  values: string[] | null,
): string | undefined {
  if (values === null) return undefined;
  return `CAST(${column} AS VARCHAR) IN (${
    values.map((v) => `'${escapeSqlLiteral(v)}'`).join(", ")
  })`;
}

function inAreaPredicate(column: string, adminArea2: string): string {
  return `UPPER(${column}) = UPPER('${escapeSqlLiteral(adminArea2)}')`;
}

// A results object with admin_area_2 is filtered on it. One with only a child
// admin column is filtered through its own family's facilities view, matching
// by NAME (the duplicate-district collision is an accepted latent, see
// SYSTEM_08's ruling). One with no admin column is served whole.
//
// The one exception to the default principle: a results object that HAS a
// child admin column but whose package has no facilities parquet for its
// family gets FALSE, never the whole parquet. Modules m004, m005 and m006 drop
// admin_area_2 from their admin3 outputs, so serving the table whole would
// show every area in the country inside a scoped product. Blank is wrong
// visibly; national data under a regional heading is wrong silently. The
// durable fix is those scripts emitting admin_area_2, tracked in the modules
// repo as PLAN_ADMIN_AREA_2_ON_ADMIN3_OUTPUTS.md.
function geographyPredicate(
  adminArea2: string | null,
  facilitiesTable: string,
  columnNames: Set<string>,
  manifest: RunManifest,
): string | undefined {
  if (adminArea2 === null) return undefined;
  if (columnNames.has("admin_area_2")) {
    return inAreaPredicate("admin_area_2", adminArea2);
  }
  const childColumn = columnNames.has("admin_area_3")
    ? "admin_area_3"
    : columnNames.has("admin_area_4")
    ? "admin_area_4"
    : undefined;
  if (childColumn === undefined) return undefined;
  if (!hasFacilitiesParquet(manifest, facilitiesTable)) return "FALSE";
  // The subquery's columns are qualified by the facilities view: an
  // unqualified child column that view lacks would bind to the results object
  // and match every row.
  return `UPPER(${childColumn}) IN (SELECT UPPER(${facilitiesTable}.${childColumn}) FROM ${facilitiesTable} WHERE ${
    inAreaPredicate(`${facilitiesTable}.admin_area_2`, adminArea2)
  })`;
}

const PHYSICAL_TIME_COLUMNS = ["period_id", "quarter_id", "year"] as const;

// The column a section's year range applies to.
function yearsColumnOf(columnNames: Set<string>): PeriodOption | undefined {
  return PHYSICAL_TIME_COLUMNS.find((column) => columnNames.has(column));
}

function yearsRangeIn(years: YearRange, column: PeriodOption): PeriodBounds {
  return {
    min: convertPeriodValue(years.start, column, false),
    max: convertPeriodValue(years.end, column, true),
  };
}

function yearsPredicate(
  years: YearRange | null,
  columnNames: Set<string>,
): string | undefined {
  const column = yearsColumnOf(columnNames);
  if (years === null || column === undefined) return undefined;
  const range = yearsRangeIn(years, column);
  return `${column} BETWEEN ${range.min} AND ${range.max}`;
}

// The years a definition holds one module's tables to: those of the module's
// family section. HFA has none.
function sectionYearsFor(
  definition: ScopeDefinition,
  manifest: RunManifest,
  moduleId: string,
): YearRange | null {
  const family = datasetFamilyFromManifest(manifest, moduleId);
  const section = family === undefined ? undefined : definition[family];
  return section !== undefined && section.include && "years" in section
    ? section.years
    : null;
}

// The manifest's periodBounds stamp is package-wide, so a reader that uses it
// in place of a query clamps it to the years of the results object's family
// section. Geography is not applied to the stamp (SYSTEM_09's ruling).
// Undefined when the section's years and the package's do not overlap.
function scopedPeriodBounds(
  ctx: RunReadContext,
  ro: RunResultsObject | undefined,
): PeriodBounds | undefined {
  const stamp = ro?.periodBounds ?? undefined;
  if (ro === undefined || stamp === undefined) return undefined;
  const column = yearsColumnOf(new Set(ro.columns.map((c) => c.name)));
  const years = sectionYearsFor(ctx.scope, ctx.manifest, ro.moduleId);
  if (years === null || column === undefined) return stamp;
  const range = yearsRangeIn(years, column);
  const clamped = {
    min: Math.max(stamp.min, range.min),
    max: Math.min(stamp.max, range.max),
  };
  return clamped.min <= clamped.max ? clamped : undefined;
}

// ── The read functions ───────────────────────────────────────────────────────

export async function getPresentationObjectItemsFromRun(
  ctx: RunReadContext,
  resultsObjectId: string,
  fetchConfig: GenericLongFormFetchConfig,
  firstPeriodOption: PeriodOption | undefined,
  maxItems?: number,
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
  const catalog = getIndicatorMetadataFromRun(ctx, ro.moduleId);
  const res = await getPresentationObjectItemsCore(
    {
      execute: executorFor(ctx, resultsObjectId),
      // Display fields only: an indicator's evaluation is a generation fact
      // used just below, never something a client or a stored figure carries.
      getIndicatorMetadata: () =>
        Promise.resolve(toIndicatorMetadataDisplay(catalog)),
    },
    resultsObjectId,
    getResultsObjectTableName(resultsObjectId),
    queryContext,
    fetchConfig,
    firstPeriodOption,
    getRunVersionInfo(ctx),
    maxItems,
  );
  // Post-aggregation catalog evaluation (PLAN_1a §1.6): the engine returned
  // SUMmed ingredient columns for main AND roll-up rows; each row's own
  // indicator expression turns them into one `value`.
  const catalogEvaluation = getCatalogEvaluationForResultsObject(
    ctx.manifest,
    resultsObjectId,
  );
  if (
    res.success && catalogEvaluation !== undefined && res.data.status === "ok"
  ) {
    res.data.items = applyCatalogExpressionsToItems(
      res.data.items,
      catalog,
      catalogEvaluation.ingredientProps,
    );
  }
  return res;
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
    metricId,
    resultsObjectId,
    resultsValue.datasetFamily,
    getRunVersionInfo(ctx),
    scopedPeriodBounds(ctx, ro),
    resultsValue.disaggregationOptions.map((d) => d.value),
    indicatorFormatsFrom(indicatorMetadata),
    indicatorRulesFrom(indicatorMetadata),
    (disOpt) =>
      getPossibleValuesFromRun(ctx, resultsObjectId, disOpt, labelMap, []),
  );
}

// Raw no-filter bounds for the replicant-options route: the manifest stamp
// IS the no-filter MIN/MAX of the physical time column, clamped to the scope's
// years.
export function getRawPeriodBoundsFromRun(
  ctx: RunReadContext,
  resultsObjectId: string,
): PeriodBounds | undefined {
  return scopedPeriodBounds(
    ctx,
    findResultsObject(ctx.manifest, resultsObjectId),
  );
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
    const execute = executorFor(ctx, resultsObjectId);
    const rawItems = await execute(
      `SELECT * FROM ${tableName}${limit ? ` LIMIT ${Math.floor(limit)}` : ""}`,
    );
    if (rawItems.length === 0) {
      return {
        success: true as const,
        data: { status: "no_data_available" as const },
      };
    }
    // The manifest rowCount is package-wide, so it is the view's count only
    // when the view is the whole parquet.
    const isWholeParquet =
      scopePredicateFor(ctx.scope, ro, ctx.manifest) === undefined;
    const totalCount = isWholeParquet ? ro.rowCount : Number(
      (await execute(`SELECT COUNT(*) AS total_count FROM ${tableName}`))
        .at(0)?.total_count ?? 0,
    );
    return {
      success: true as const,
      data: {
        status: "ok" as const,
        totalCount,
        items: rawItems as Record<string, string>[],
      },
    };
  });
}
