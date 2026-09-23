import {
  encodeGridItems,
  getPeriodFilterExactBounds,
  isValidDisaggregationOption,
  validateFetchConfig,
  type APIResponseNoData,
  type APIResponseWithData,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  type GridItemsHolder,
  type ItemsHolderPresentationObject,
  type PeriodBounds,
  type PeriodOption,
  type ResultsValueInfoForPresentationObject,
  type RunReplicantOptions,
} from "lib";
import {
  _GRID_ITEMS_CACHE,
  _METRIC_INFO_CACHE,
  _PO_ITEMS_CACHE,
  _REPLICANT_OPTIONS_CACHE,
  type PoDataVersionParams,
} from "../routes/caches/visualizations.ts";
import type { TimCacheC } from "../valkey/cache_class_C.ts";
import {
  exceedsMaxReplicantOptions,
  GRID_MAX_CELLS,
} from "../server_only_funcs_presentation_objects/consts.ts";
import { RequestQueue } from "../utils/request_queue.ts";
import { getCatalogEvaluationForResultsObject } from "./catalog_expression_items.ts";
import {
  findMissingRequiredGroupBys,
  getIndicatorMetadataFromRun,
  getModuleIdForMetricFromRun,
  getModuleIdForResultsObjectFromRun,
  getPossibleValuesFromRun,
  getPresentationObjectItemsFromRun,
  getRawPeriodBoundsFromRun,
  getResultsValueInfoFromRun,
  getRunVersionInfo,
  moduleHasRun,
  type RunReadContext,
} from "./run_read.ts";

// The package-data reads the run-keyed instance routes serve
// (routes/instance/run_generation.ts, the caller supplying the (runId,
// adminArea2) pair its product carries), written once over a RunReadContext.
// Cache check before the queue (a
// duplicate must not consume a slot), then the expensive query under the
// shared concurrency limit. The queues are module-level on purpose: the limit
// is per process, not per mount.

// With 20 DB connections, allow 10 concurrent PO items queries: headroom
// for auth and other lightweight queries.
const poItemsQueue = new RequestQueue(10);
// Lighter queries, still limited during burst loads. Shared by metric info
// and replicant options.
const resultsValueInfoQueue = new RequestQueue(15);

function queueStats(queue: RequestQueue): string {
  const stats = queue.getStats();
  return `[Queue: ${stats.running}/${stats.maxConcurrent} running, ${stats.queued} waiting]`;
}

// The checks both row reads run before touching a cache: the results object
// exists and its module ran, every required groupBy is present, and a
// catalog-evaluated results object is asked only for its SUMmed ingredients.
function checkRowsRequest(
  runCtx: RunReadContext,
  body: RowsRequestBody,
): APIResponseNoData {
  validateFetchConfig(body.fetchConfig);

  const moduleId = getModuleIdForResultsObjectFromRun(
    runCtx,
    body.resultsObjectId,
  );
  if (moduleId === undefined) {
    return {
      success: false,
      err: `Unknown results object: ${body.resultsObjectId}`,
    };
  }
  if (!moduleHasRun(runCtx, moduleId)) {
    return { success: false, err: "Module not found or has not run yet" };
  }

  const missingRequired = findMissingRequiredGroupBys(
    runCtx,
    body.resultsObjectId,
    body.fetchConfig.groupBys,
  );
  if (missingRequired.length > 0) {
    return {
      success: false,
      err: `Required disaggregation option(s) not grouped: ${
        missingRequired.join(", ")
      }`,
    };
  }

  // Guards on a catalog-evaluated results object (PLAN_1a §1.7): validations
  // of a DECLARED fact, never inference. Its value comes from applying each
  // indicator's own catalog expression to SUMmed ingredient columns, so a
  // request may only ever ask for those columns, summed, with no expression of
  // its own. App clients never send anything else; this guards hand-crafted
  // requests, and the PAE one is a real bypass without it (fetch-config
  // validation accepts a post-aggregation expression unconditionally).
  const catalogEvaluation = getCatalogEvaluationForResultsObject(
    runCtx.manifest,
    body.resultsObjectId,
  );
  if (catalogEvaluation !== undefined) {
    if (body.fetchConfig.postAggregationExpression !== undefined) {
      return {
        success: false,
        err:
          "This results object computes its value from the indicator catalog; a post-aggregation expression cannot be supplied",
      };
    }
    const declared = new Set(catalogEvaluation.ingredientProps);
    for (const value of body.fetchConfig.values) {
      if (value.func !== "SUM") {
        return {
          success: false,
          err:
            `This results object only supports SUM over its ingredient columns (got ${value.func} on ${value.prop})`,
        };
      }
      if (!declared.has(value.prop)) {
        return {
          success: false,
          err: `Not an ingredient column of this results object: ${value.prop}`,
        };
      }
    }
  }
  return { success: true };
}

// Derived from the manifest, never from the client: the value shapes
// period-bound resolution but is absent from the cache hash, so a stale
// client detail (from a previously attached run) would poison this run's
// shared cache entry. physicalTimeColumn IS the most granular period column
// (the derivation inferMostGranularTimePeriodColumn reduces to it on the run
// plane).
function firstPeriodOptionFor(
  runCtx: RunReadContext,
  resultsObjectId: string,
): PeriodOption | undefined {
  return runCtx.manifest.resultsObjects.find((ro) => ro.id === resultsObjectId)
    ?.physicalTimeColumn ?? undefined;
}

type RowsRequestBody = {
  resultsObjectId: string;
  fetchConfig: GenericLongFormFetchConfig;
};

type RowsCacheKey = {
  runId: string;
  resultsObjectId: string;
  fetchConfig: GenericLongFormFetchConfig;
  scopeToken: string;
};

// The two row reads differ only in their cache and in what they compute on
// a miss.
async function readRowsCached<T>(
  label: string,
  cache: TimCacheC<RowsCacheKey, PoDataVersionParams, APIResponseWithData<T>>,
  runCtx: RunReadContext,
  body: RowsRequestBody,
  compute: (firstPeriodOption: PeriodOption | undefined) => Promise<
    APIResponseWithData<T>
  >,
): Promise<APIResponseWithData<T>> {
  const t0 = performance.now();
  const tag = `[SERVER] ${label} ${body.resultsObjectId.slice(0, 8)}`;
  console.log(`${tag}: REQUEST received`);
  const check = checkRowsRequest(runCtx, body);
  if (check.success === false) return check;
  const versionParams = getRunVersionInfo(runCtx);

  const cacheKey = {
    runId: runCtx.runId,
    resultsObjectId: body.resultsObjectId,
    fetchConfig: body.fetchConfig,
    scopeToken: runCtx.scopeToken,
  };
  const existing = await cache.get(cacheKey, versionParams);
  if (existing && existing.success === true) {
    console.log(
      `${tag}: HIT (${(performance.now() - t0).toFixed(0)}ms) ${
        queueStats(poItemsQueue)
      }`,
    );
    return existing;
  }

  console.log(`${tag}: ENTERING QUEUE ${queueStats(poItemsQueue)}`);
  return await poItemsQueue.enqueue(async () => {
    console.log(
      `${tag}: EXECUTING (waited ${
        (performance.now() - t0).toFixed(0)
      }ms in queue)`,
    );
    const newPromise = compute(
      firstPeriodOptionFor(runCtx, body.resultsObjectId),
    );
    cache.setPromise(newPromise, cacheKey, versionParams);
    const res = await newPromise;
    console.log(
      `${tag}: MISS (${(performance.now() - t0).toFixed(0)}ms) ${
        queueStats(poItemsQueue)
      }`,
    );
    return res;
  });
}

export function readRunItems(
  runCtx: RunReadContext,
  body: RowsRequestBody,
): Promise<APIResponseWithData<ItemsHolderPresentationObject>> {
  return readRowsCached(
    "PO Items",
    _PO_ITEMS_CACHE,
    runCtx,
    body,
    (firstPeriodOption) =>
      getPresentationObjectItemsFromRun(
        runCtx,
        body.resultsObjectId,
        body.fetchConfig,
        firstPeriodOption,
      ),
  );
}

// The Explore grid read: the items read's rows under GRID_MAX_CELLS instead
// of MAX_ITEMS, dictionary-encoded (lib/grid_items.ts).
export function readRunGridItems(
  runCtx: RunReadContext,
  body: RowsRequestBody,
): Promise<APIResponseWithData<GridItemsHolder>> {
  return readRowsCached(
    "Grid Items",
    _GRID_ITEMS_CACHE,
    runCtx,
    body,
    async (firstPeriodOption) => {
      const res = await getPresentationObjectItemsFromRun(
        runCtx,
        body.resultsObjectId,
        body.fetchConfig,
        firstPeriodOption,
        GRID_MAX_CELLS,
      );
      return res.success
        ? { success: true, data: toGridItemsHolder(res.data) }
        : res;
    },
  );
}

function toGridItemsHolder(ih: ItemsHolderPresentationObject): GridItemsHolder {
  const base = {
    resultsObjectId: ih.resultsObjectId,
    fetchConfig: ih.fetchConfig,
    runId: ih.runId,
    scopeToken: ih.scopeToken,
    dateRange: ih.dateRange,
  };
  switch (ih.status) {
    case "ok":
      return {
        ...base,
        status: "ok",
        ...encodeGridItems(ih.items, ih.fetchConfig.groupBys),
        indicatorMetadata: ih.indicatorMetadata,
      };
    case "too_many_items":
      return { ...base, status: "too_many_cells" };
    case "no_data_available":
      return { ...base, status: "no_data_available" };
  }
}

export async function readRunResultsValueInfo(
  runCtx: RunReadContext,
  metricId: string,
): Promise<APIResponseWithData<ResultsValueInfoForPresentationObject>> {
  const t0 = performance.now();
  const tag = `[SERVER] Results Value Info ${metricId.slice(0, 8)}`;

  const moduleId = getModuleIdForMetricFromRun(runCtx, metricId);
  if (moduleId === undefined) {
    return { success: false, err: `Unknown metric: ${metricId}` };
  }
  if (!moduleHasRun(runCtx, moduleId)) {
    return { success: false, err: "Module not found or has not run yet" };
  }
  const versionParams = getRunVersionInfo(runCtx);

  console.log(`${tag}: REQUEST received`);
  const cacheKey = {
    runId: runCtx.runId,
    metricId,
    scopeToken: runCtx.scopeToken,
  };
  const existing = await _METRIC_INFO_CACHE.get(cacheKey, versionParams);
  if (existing && existing.success === true) {
    console.log(
      `${tag}: HIT (${(performance.now() - t0).toFixed(0)}ms) ${
        queueStats(resultsValueInfoQueue)
      }`,
    );
    return existing;
  }

  console.log(`${tag}: ENTERING QUEUE ${queueStats(resultsValueInfoQueue)}`);
  return await resultsValueInfoQueue.enqueue(async () => {
    console.log(
      `${tag}: EXECUTING (waited ${
        (performance.now() - t0).toFixed(0)
      }ms in queue)`,
    );
    const newPromise = getResultsValueInfoFromRun(runCtx, metricId);
    _METRIC_INFO_CACHE.setPromise(newPromise, cacheKey, versionParams);
    const res = await newPromise;
    console.log(
      `${tag}: MISS (${(performance.now() - t0).toFixed(0)}ms) ${
        queueStats(resultsValueInfoQueue)
      }`,
    );
    return res;
  });
}

// The replicant dimension's option list: one figure per value, so this is
// what bounds the fan-out before any items query runs. Keyed by results
// object, the cache identity; the run-keyed route narrows its metric id to
// the results object first.
export async function readRunReplicantOptions(
  runCtx: RunReadContext,
  body: {
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
  },
): Promise<APIResponseWithData<RunReplicantOptions>> {
  // body is attacker-controllable and flows into generated SQL via
  // getPossibleValuesFromRun (replicateBy becomes a column reference) and
  // the fetchConfig filters.
  validateFetchConfig(body.fetchConfig);
  if (!isValidDisaggregationOption(body.replicateBy)) {
    return { success: false, err: `Invalid replicateBy: ${body.replicateBy}` };
  }

  const moduleId = getModuleIdForResultsObjectFromRun(
    runCtx,
    body.resultsObjectId,
  );
  if (moduleId === undefined) {
    return {
      success: false,
      err: `Unknown results object: ${body.resultsObjectId}`,
    };
  }
  if (!moduleHasRun(runCtx, moduleId)) {
    return { success: false, err: "Module not found or has not run yet" };
  }
  const versionInfo = getRunVersionInfo(runCtx);

  const t0 = performance.now();
  const tag = `[SERVER] Replicant Options ${body.resultsObjectId.slice(0, 8)}`;
  const filterSummary = body.fetchConfig.filters.length > 0
    ? `${body.fetchConfig.filters.length} filters`
    : "no filters";
  console.log(
    `${tag}: REQUEST received (${filterSummary}, replicateBy: ${body.replicateBy})`,
  );

  const cacheKey = {
    runId: runCtx.runId,
    resultsObjectId: body.resultsObjectId,
    replicateBy: body.replicateBy,
    fetchConfig: body.fetchConfig,
    scopeToken: runCtx.scopeToken,
  };
  const existing = await _REPLICANT_OPTIONS_CACHE.get(cacheKey, versionInfo);
  if (existing && existing.success === true) {
    console.log(
      `${tag}: HIT (${(performance.now() - t0).toFixed(0)}ms) ${
        queueStats(resultsValueInfoQueue)
      }`,
    );
    return existing;
  }

  console.log(`${tag}: ENTERING QUEUE ${queueStats(resultsValueInfoQueue)}`);
  return await resultsValueInfoQueue.enqueue(async () => {
    console.log(
      `${tag}: EXECUTING (waited ${
        (performance.now() - t0).toFixed(0)
      }ms in queue)`,
    );
    const holderBase = {
      resultsObjectId: body.resultsObjectId,
      replicateBy: body.replicateBy,
      fetchConfig: body.fetchConfig,
      ...versionInfo,
    };
    const newPromise = (async (): Promise<
      APIResponseWithData<RunReplicantOptions>
    > => {
      const indicatorMetadata = getIndicatorMetadataFromRun(runCtx, moduleId);
      const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));

      // Resolve the period filter to exact bounds the same way the items
      // query does, so relative filters ("last N months") narrow the option
      // list too and from_month re-anchors to the live data: a bounded-only
      // read here would list values the filtered figure can never show. The
      // manifest stamp IS the no-filter bounds of the physical time column.
      let periodFilterExactBounds: PeriodBounds | undefined;
      if (body.fetchConfig.periodFilter) {
        try {
          periodFilterExactBounds = getPeriodFilterExactBounds(
            body.fetchConfig.periodFilter,
            getRawPeriodBoundsFromRun(runCtx, body.resultsObjectId),
          );
        } catch (e) {
          return {
            success: true,
            data: {
              ...holderBase,
              status: "error",
              message: e instanceof Error ? e.message : String(e),
            },
          };
        }
      }

      const resDisPossibleVals = await getPossibleValuesFromRun(
        runCtx,
        body.resultsObjectId,
        body.replicateBy,
        labelMap,
        body.fetchConfig.filters,
        periodFilterExactBounds,
      );
      if (resDisPossibleVals.success === false) {
        return {
          success: true,
          data: {
            ...holderBase,
            // Surfaced as its own status (matching the metric-info path)
            // instead of masquerading as no_values_available.
            status: "error",
            message: resDisPossibleVals.err,
          },
        };
      }

      const vals = resDisPossibleVals.data;
      if (exceedsMaxReplicantOptions(vals)) {
        return {
          success: true,
          data: { ...holderBase, status: "too_many_values" },
        };
      }
      if (vals.length === 0) {
        return {
          success: true,
          data: { ...holderBase, status: "no_values_available" },
        };
      }
      return {
        success: true,
        data: { ...holderBase, status: "ok", possibleValues: vals },
      };
    })();
    _REPLICANT_OPTIONS_CACHE.setPromise(newPromise, cacheKey, versionInfo);
    const res = await newPromise;
    console.log(
      `${tag}: MISS (${(performance.now() - t0).toFixed(0)}ms) ${
        queueStats(resultsValueInfoQueue)
      }`,
    );
    return res;
  });
}
