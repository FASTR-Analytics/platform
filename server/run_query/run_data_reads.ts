import {
  validateFetchConfig,
  type APIResponseWithData,
  type GenericLongFormFetchConfig,
  type ItemsHolderPresentationObject,
  type ResultsValueInfoForPresentationObject,
} from "lib";
import {
  _METRIC_INFO_CACHE,
  _PO_ITEMS_CACHE,
} from "../routes/caches/visualizations.ts";
import { RequestQueue } from "../utils/request_queue.ts";
import { getCatalogEvaluationForResultsObject } from "./catalog_expression_items.ts";
import {
  findMissingRequiredGroupBys,
  getModuleIdForMetricFromRun,
  getModuleIdForResultsObjectFromRun,
  getPresentationObjectItemsFromRun,
  getResultsValueInfoFromRun,
  getRunVersionInfo,
  moduleHasRun,
  type RunReadContext,
} from "./run_read.ts";

// The two package-data reads a route serves, written once over a
// RunReadContext and mounted twice — project lens (routes/project/
// presentation_objects.ts) and run lens (routes/instance/run_data.ts). Cache
// check before the queue (a duplicate must not consume a slot), then the
// expensive query under the shared concurrency limit. The queues are
// module-level on purpose: the limit is per process, not per mount.

// With 20 DB connections, allow 10 concurrent PO items queries — headroom
// for auth and other lightweight queries.
const poItemsQueue = new RequestQueue(10);
// Lighter queries, still limited during burst loads. Exported because the
// (project-only) replicant-options route shares this limit.
export const resultsValueInfoQueue = new RequestQueue(15);

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
  if (!moduleHasRun(runCtx, moduleId)) {
    return { success: false, err: "Module not found or has not run yet" };
  }
  const versionParams = getRunVersionInfo(runCtx);

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

  // Guards on a catalog-evaluated results object (PLAN_1a §1.7) — validations
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
