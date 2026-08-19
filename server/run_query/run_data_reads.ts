import {
  getPeriodFilterExactBounds,
  isValidDisaggregationOption,
  validateFetchConfig,
  type APIResponseWithData,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  type ItemsHolderPresentationObject,
  type PeriodBounds,
  type ReplicantOptionsForPresentationObject,
  type ResultsValueInfoForPresentationObject,
} from "lib";
import {
  _METRIC_INFO_CACHE,
  _PO_ITEMS_CACHE,
  _REPLICANT_OPTIONS_CACHE,
} from "../routes/caches/visualizations.ts";
import { exceedsMaxReplicantOptions } from "../server_only_funcs_presentation_objects/consts.ts";
import { RequestQueue } from "../utils/request_queue.ts";
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
  resolveMetricFromRun,
  type RunReadContext,
} from "./run_read.ts";

// The three package-data reads a route serves, written once over a
// RunReadContext and mounted ONCE (PLAN_PRODUCTS_RESTRUCTURE D7 —
// routes/instance/run_generation.ts, run-keyed, the caller supplying the
// (runId, adminArea2) pair its product carries). Cache check before the queue
// (a duplicate must not consume a slot), then the expensive query under the
// shared concurrency limit. The queues are module-level on purpose: the limit
// is per process, not per caller.

// With 20 DB connections, allow 10 concurrent PO items queries — headroom
// for auth and other lightweight queries.
const poItemsQueue = new RequestQueue(10);
// Lighter queries, still limited during burst loads. Shared by metric info
// and replicant options.
const resultsValueInfoQueue = new RequestQueue(15);

function queueStats(queue: RequestQueue): string {
  const stats = queue.getStats();
  return `[Queue: ${stats.running}/${stats.maxConcurrent} running, ${stats.queued} waiting]`;
}

export async function readRunItems(
  runCtx: RunReadContext,
  body: {
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
  },
): Promise<APIResponseWithData<ItemsHolderPresentationObject>> {
  const t0 = performance.now();
  const tag = `[SERVER] PO Items ${body.resultsObjectId.slice(0, 8)}`;
  console.log(`${tag}: REQUEST received`);
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
  const versionParams = getRunVersionInfo(runCtx, moduleId);
  if (versionParams.moduleLastRun === "unknown") {
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

  const cacheKey = {
    runId: runCtx.runId,
    resultsObjectId: body.resultsObjectId,
    fetchConfig: body.fetchConfig,
    scopeToken: runCtx.scopeToken,
  };
  const existing = await _PO_ITEMS_CACHE.get(cacheKey, versionParams);
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
    // Derived from the manifest, never from the client: the value shapes
    // period-bound resolution but is absent from the cache hash, so a stale
    // client detail (from a previously attached run) would poison this
    // run's shared cache entry. physicalTimeColumn IS the most granular
    // period column (the derivation inferMostGranularTimePeriodColumn
    // reduces to it on the run plane).
    const firstPeriodOption = runCtx.manifest.resultsObjects.find(
      (ro) => ro.id === body.resultsObjectId,
    )?.physicalTimeColumn ?? undefined;
    const newPromise = getPresentationObjectItemsFromRun(
      runCtx,
      body.resultsObjectId,
      body.fetchConfig,
      firstPeriodOption,
    );
    _PO_ITEMS_CACHE.setPromise(newPromise, cacheKey, versionParams);
    const res = await newPromise;
    console.log(
      `${tag}: MISS (${(performance.now() - t0).toFixed(0)}ms) ${
        queueStats(poItemsQueue)
      }`,
    );
    return res;
  });
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
  const versionParams = getRunVersionInfo(runCtx, moduleId);
  if (versionParams.moduleLastRun === "unknown") {
    return { success: false, err: "Module not found or has not run yet" };
  }

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
// what bounds the fan-out before any items query runs. `metricId` (not a
// results-object id) is the caller's handle — the results object is the
// metric's, resolved from the manifest here, which is the same narrowing
// getRunResultsValueInfo does.
export async function readRunReplicantOptions(
  runCtx: RunReadContext,
  body: {
    metricId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
  },
): Promise<APIResponseWithData<ReplicantOptionsForPresentationObject>> {
  // body is attacker-controllable and flows into generated SQL via
  // getPossibleValues (replicateBy → column ref) and the fetchConfig filters.
  validateFetchConfig(body.fetchConfig);
  if (!isValidDisaggregationOption(body.replicateBy)) {
    return { success: false, err: `Invalid replicateBy: ${body.replicateBy}` };
  }

  const metricRes = resolveMetricFromRun(runCtx, body.metricId);
  if (metricRes.success === false) {
    return metricRes;
  }
  const { resultsObjectId } = metricRes.data.resultsValue;
  const moduleId = metricRes.data.moduleId;
  const versionInfo = getRunVersionInfo(runCtx, moduleId);
  if (versionInfo.moduleLastRun === "unknown") {
    return { success: false, err: "Module not found or has not run yet" };
  }

  const t0 = performance.now();
  const tag = `[SERVER] Replicant Options ${resultsObjectId.slice(0, 8)}`;
  const filterSummary = body.fetchConfig.filters.length > 0
    ? `${body.fetchConfig.filters.length} filters`
    : "no filters";
  console.log(
    `${tag}: REQUEST received (${filterSummary}, replicateBy: ${body.replicateBy})`,
  );

  const cacheKey = {
    runId: runCtx.runId,
    resultsObjectId,
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
      resultsObjectId,
      replicateBy: body.replicateBy,
      fetchConfig: body.fetchConfig,
      ...versionInfo,
    };
    const newPromise = (async (): Promise<
      APIResponseWithData<ReplicantOptionsForPresentationObject>
    > => {
      const indicatorMetadata = getIndicatorMetadataFromRun(runCtx, moduleId);
      const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));

      // Resolve the period filter to exact bounds the same way the items
      // query does, so relative filters ("last N months") narrow the option
      // list too and from_month re-anchors to the live data — a bounded-only
      // read here would list values the filtered figure can never show. The
      // manifest stamp IS the no-filter bounds of the physical time column.
      let periodFilterExactBounds: PeriodBounds | undefined;
      if (body.fetchConfig.periodFilter) {
        try {
          periodFilterExactBounds = getPeriodFilterExactBounds(
            body.fetchConfig.periodFilter,
            getRawPeriodBoundsFromRun(runCtx, resultsObjectId),
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
        resultsObjectId,
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
