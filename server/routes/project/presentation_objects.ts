import { Hono } from "hono";
import { Sql } from "postgres";
import {
  getPeriodFilterExactBounds,
  isValidDisaggregationOption,
  validateFetchConfig,
  type PeriodBounds,
  type PeriodOption,
} from "lib";
import {
  detectColumnExists,
  detectHasPeriodId,
  getResultsObjectTableName,
} from "../../db/utils.ts";
import { getPeriodBounds } from "../../server_only_funcs_presentation_objects/get_period_bounds.ts";
import {
  addPresentationObject,
  batchUpdatePresentationObjectsPeriodFilter,
  deletePresentationObject,
  duplicatePresentationObject,
  getAllPresentationObjectsForProject,
  getPresentationObjectDetail,
  updatePresentationObjectConfig,
  updatePresentationObjectLabel,
} from "../../db/mod.ts";
import {
  presentationObjectConfigSchema,
  GenericLongFormFetchConfig,
  ResultsValue,
  PresentationObjectConfig,
} from "lib";
import { log } from "../../middleware/mod.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { MAX_REPLICANT_OPTIONS } from "../../server_only_funcs_presentation_objects/consts.ts";
import {
  getDatasetFamilyForModule,
  getIndicatorMetadata,
  getPossibleValues,
  getPresentationObjectItems,
  getResultsValueInfoForPresentationObject,
} from "../../server_only_funcs_presentation_objects/mod.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { notifyProjectVisualizationsUpdated } from "../../task_management/notify_project_v2.ts";
import { RequestQueue } from "../../utils/request_queue.ts";
import {
  _METRIC_INFO_CACHE,
  _PO_DETAIL_CACHE,
  _PO_ITEMS_CACHE,
  _REPLICANT_OPTIONS_CACHE,
  type PoDataVersionParams,
} from "../caches/visualizations.ts";
import { defineRoute } from "../route-helpers.ts";
import { _RESULTS_READ_PATH } from "../../exposed_env_vars.ts";
import {
  getIndicatorMetadataFromRun,
  getModuleIdForResultsObjectFromRun,
  getPossibleValuesFromRun,
  getPresentationObjectDetailFromRun,
  getPresentationObjectItemsFromRun,
  getRawPeriodBoundsFromRun,
  getResultsValueInfoFromRun,
  getRunReadContextForProject,
  getRunVersionInfo,
  type RunReadContext,
} from "../../run_query/mod.ts";

// Resolves the attached-run context when RESULTS_READ_PATH=runs; null means
// the flag is on but the project has no run attached (loud, not a fallback —
// the flag is a hard cutover, PLAN_RESULTS_RUNS §3.6).
async function resolveRunCtx(
  mainDb: Sql,
  projectId: string,
): Promise<RunReadContext | "no_run_attached" | undefined> {
  if (_RESULTS_READ_PATH !== "runs") return undefined;
  const ctx = await getRunReadContextForProject(mainDb, projectId);
  return ctx ?? "no_run_attached";
}

const NO_RUN_ERR = {
  success: false as const,
  err: "No results run is attached to this project",
};

export const routesPresentationObjects = new Hono();

// Queue to limit concurrent PO items requests
// With 20 DB connections, allow 10 concurrent PO items queries
// This leaves headroom for auth and other lightweight queries
const poItemsQueue = new RequestQueue(10);

// Queue for Variable Info requests
// These are lighter queries, but still need limiting during burst loads
const resultsValueInfoQueue = new RequestQueue(15);

// Version string for the datasets feeding a project's indicator metadata.
// indicatorMetadata — baked into items holders (getPresentationObjectItems) and
// metric info (getResultsValueInfoForPresentationObject) — is rewritten on
// dataset integration, which bumps datasets.last_updated independently of
// moduleLastRun. Both caches version on this so re-integration invalidates them.
async function getDatasetsVersion(projectDb: Sql): Promise<string> {
  const rows = await projectDb<{ dataset_type: string; last_updated: string }[]>`
SELECT dataset_type, last_updated FROM datasets ORDER BY dataset_type
`;
  return rows
    .map(
      (d: { dataset_type: string; last_updated: string }) =>
        `${d.dataset_type}:${d.last_updated}`,
    )
    .join(",");
}

defineRoute(
  routesPresentationObjects,
  "createPresentationObject",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  log("createPresentationObject"),
  async (c, { body }) => {
    const res = await addPresentationObject({
      projectDb: c.var.ppk.projectDb,
      projectUser: c.var.projectUser,
      label: body.label,
      resultsValue: body.resultsValue as ResultsValue,
      config: body.config as PresentationObjectConfig,
      makeDefault: body.makeDefault,
      folderId: body.folderId,
    });
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      [res.data.newPresentationObjectId],
      res.data.lastUpdated,
    );
    const vizRes = await getAllPresentationObjectsForProject(c.var.ppk.projectDb);
    if (vizRes.success) {
      notifyProjectVisualizationsUpdated(c.var.ppk.projectId, vizRes.data);
    }
    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "duplicatePresentationObject",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  log("duplicatePresentationObject"),
  async (c, { params, body }) => {
    const res = await duplicatePresentationObject(
      c.var.ppk.projectDb,
      params.po_id,
      body.label,
      body.folderId,
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      [res.data.newPresentationObjectId],
      res.data.lastUpdated,
    );
    const vizRes = await getAllPresentationObjectsForProject(c.var.ppk.projectDb);
    if (vizRes.success) {
      notifyProjectVisualizationsUpdated(c.var.ppk.projectId, vizRes.data);
    }
    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "getAllPresentationObjects",
  requireProjectPermission("can_view_visualizations"),
  async (c) => {
    const res = await getAllPresentationObjectsForProject(c.var.ppk.projectDb);
    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "getPresentationObjectDetail",
  requireProjectPermission("can_view_visualizations"),
  async (c, { params }) => {
    const t0 = performance.now();

    // Get last updated to use as version key
    const poData = (
      await c.var.ppk.projectDb<{ last_updated: string }[]>`
        SELECT last_updated FROM presentation_objects WHERE id = ${params.po_id}
      `
    ).at(0);

    if (!poData) {
      return c.json({ success: false, err: "Presentation object not found" });
    }

    const runCtx = await resolveRunCtx(c.var.mainDb, c.var.ppk.projectId);
    if (runCtx === "no_run_attached") return c.json(NO_RUN_ERR);

    // Check cache
    const existing = await _PO_DETAIL_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        presentationObjectId: params.po_id,
      },
      {
        presentationObjectLastUpdated: poData.last_updated,
        runId: runCtx?.runId,
      },
    );

    if (existing) {
      const t1 = performance.now();
      console.log(
        `[SERVER] PO Detail ${params.po_id.slice(0, 8)}: HIT (${(
          t1 - t0
        ).toFixed(0)}ms)`,
      );
      // Adapt legacy shapes on the cache-hit path. Pre-deploy Valkey entries
      // may have old-shape configs that the DB-function adapter never saw.
      // Idempotent for already-adapted entries.
      return c.json(
        existing.success
          ? {
              ...existing,
              data: {
                ...existing.data,
                config: presentationObjectConfigSchema.parse(existing.data.config),
              },
            }
          : existing,
      );
    }

    // Cache miss - fetch and store
    const newPromise = runCtx
      ? getPresentationObjectDetailFromRun(
          runCtx,
          c.var.ppk.projectId,
          c.var.ppk.projectDb,
          params.po_id,
        )
      : getPresentationObjectDetail(
          c.var.ppk.projectId,
          c.var.ppk.projectDb,
          params.po_id,
          c.var.mainDb,
        );

    _PO_DETAIL_CACHE.setPromise(
      newPromise,
      {
        projectId: c.var.ppk.projectId,
        presentationObjectId: params.po_id,
      },
      {
        presentationObjectLastUpdated: poData.last_updated,
        runId: runCtx?.runId,
      },
    );

    const res = await newPromise;
    const t1 = performance.now();
    console.log(
      `[SERVER] PO Detail ${params.po_id.slice(0, 8)}: MISS (${(
        t1 - t0
      ).toFixed(0)}ms)`,
    );
    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "updatePresentationObjectLabel",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  log("updatePresentationObjectLabel"),
  async (c, { params, body }) => {
    const res = await updatePresentationObjectLabel(
      c.var.ppk.projectDb,
      params.po_id,
      body.label,
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      [params.po_id],
      res.data.lastUpdated,
    );
    const vizRes = await getAllPresentationObjectsForProject(c.var.ppk.projectDb);
    if (vizRes.success) {
      notifyProjectVisualizationsUpdated(c.var.ppk.projectId, vizRes.data);
    }
    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "updatePresentationObjectConfig",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  log("updatePresentationObjectConfig"),
  async (c, { params, body }) => {
    const res = await updatePresentationObjectConfig(
      c.var.ppk.projectDb,
      params.po_id,
      body.config as PresentationObjectConfig,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      [params.po_id],
      res.data.lastUpdated,
    );
    const vizRes = await getAllPresentationObjectsForProject(c.var.ppk.projectDb);
    if (vizRes.success) {
      notifyProjectVisualizationsUpdated(c.var.ppk.projectId, vizRes.data);
    }
    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "batchUpdatePresentationObjectsPeriodFilter",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  async (c, { body }) => {
    const res = await batchUpdatePresentationObjectsPeriodFilter(
      c.var.ppk.projectDb,
      body.presentationObjectIds,
      body.periodFilter,
    );

    if (res.success) {
      notifyLastUpdated(
        c.var.ppk.projectId,
        "presentation_objects",
        body.presentationObjectIds,
        res.data.lastUpdated,
      );

      const vizRes = await getAllPresentationObjectsForProject(c.var.ppk.projectDb);
      if (vizRes.success) {
        notifyProjectVisualizationsUpdated(c.var.ppk.projectId, vizRes.data);
      }
    }

    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "deletePresentationObject",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  log("deletePresentationObject"),
  async (c, { params }) => {
    const res = await deletePresentationObject(
      c.var.ppk.projectDb,
      params.po_id,
    );
    if (res.success === false) {
      return c.json(res);
    }
    const vizRes = await getAllPresentationObjectsForProject(c.var.ppk.projectDb);
    if (vizRes.success) {
      notifyProjectVisualizationsUpdated(c.var.ppk.projectId, vizRes.data);
    }
    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "getPresentationObjectItems",
  requireProjectPermission("can_view_visualizations"),
  async (c, { body }) => {
    const t0 = performance.now();
    console.log(
      `[SERVER] PO Items ${body.resultsObjectId.slice(0, 8)}: REQUEST received`,
    );
    validateFetchConfig(body.fetchConfig as GenericLongFormFetchConfig);

    const runCtx = await resolveRunCtx(c.var.mainDb, c.var.ppk.projectId);
    if (runCtx === "no_run_attached") return c.json(NO_RUN_ERR);

    let legacyVersion: { moduleLastRun: string; datasetsVersion: string } | undefined;
    if (!runCtx) {
      // Derive moduleId from resultsObjectId via DB lookup
      const roRow = (await c.var.ppk.projectDb<{ module_id: string }[]>`
SELECT module_id FROM results_objects WHERE id = ${body.resultsObjectId}
`).at(0);
      if (!roRow) {
        return c.json({ success: false, err: `Unknown results object: ${body.resultsObjectId}` });
      }
      const moduleId = roRow.module_id;

      const moduleLastRun = (
        await c.var.ppk.projectDb<{ last_run_at: string }[]>`
SELECT last_run_at FROM modules WHERE id = ${moduleId}
`
      ).at(0)?.last_run_at;

      if (!moduleLastRun) {
        return c.json({
          success: false,
          err: "Module not found or has not run yet",
        });
      }

      legacyVersion = {
        moduleLastRun,
        datasetsVersion: await getDatasetsVersion(c.var.ppk.projectDb),
      };
    }
    const versionParams: PoDataVersionParams = runCtx
      ? { runId: runCtx.runId }
      : legacyVersion!;

    // Check cache BEFORE queueing - prevents duplicates from consuming queue slots
    const existing = await _PO_ITEMS_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        resultsObjectId: body.resultsObjectId,
        fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
        runId: runCtx?.runId,
      },
      versionParams,
    );
    if (existing && existing.success === true) {
      const t1 = performance.now();
      const stats = poItemsQueue.getStats();
      console.log(
        `[SERVER] PO Items ${body.resultsObjectId.slice(0, 8)}: HIT (${(
          t1 - t0
        ).toFixed(
          0,
        )}ms) [Queue: ${stats.running}/${stats.maxConcurrent} running, ${stats.queued} waiting]`,
      );
      return c.json(existing);
    }

    // Only queue on cache miss - the expensive query
    const stats = poItemsQueue.getStats();
    console.log(
      `[SERVER] PO Items ${body.resultsObjectId.slice(
        0,
        8,
      )}: ENTERING QUEUE [Queue: ${stats.running}/${stats.maxConcurrent} running, ${stats.queued} waiting]`,
    );
    const result = await poItemsQueue.enqueue(async () => {
      const tQueue = performance.now();
      console.log(
        `[SERVER] PO Items ${body.resultsObjectId.slice(
          0,
          8,
        )}: EXECUTING (waited ${(tQueue - t0).toFixed(0)}ms in queue)`,
      );
      const newPromise = runCtx
        ? getPresentationObjectItemsFromRun(
            runCtx,
            c.var.ppk.projectId,
            body.resultsObjectId,
            body.fetchConfig as GenericLongFormFetchConfig,
            body.firstPeriodOption,
          )
        : getPresentationObjectItems(
            c.var.mainDb,
            c.var.ppk.projectId,
            c.var.ppk.projectDb,
            body.resultsObjectId,
            body.fetchConfig as GenericLongFormFetchConfig,
            body.firstPeriodOption,
            legacyVersion!.moduleLastRun,
            legacyVersion!.datasetsVersion,
          );
      _PO_ITEMS_CACHE.setPromise(
        newPromise,
        {
          projectId: c.var.ppk.projectId,
          resultsObjectId: body.resultsObjectId,
          fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
          runId: runCtx?.runId,
        },
        versionParams,
      );
      const res = await newPromise;
      const t1 = performance.now();
      const stats = poItemsQueue.getStats();
      console.log(
        `[SERVER] PO Items ${body.resultsObjectId.slice(0, 8)}: MISS (${(
          t1 - t0
        ).toFixed(
          0,
        )}ms) [Queue: ${stats.running}/${stats.maxConcurrent} running, ${stats.queued} waiting]`,
      );
      return res;
    });

    return c.json(result);
  },
);

defineRoute(
  routesPresentationObjects,
  "getResultsValueInfoForPresentationObject",
  requireProjectPermission("can_view_visualizations"),
  async (c, { body }) => {
    const t0 = performance.now();

    const runCtx = await resolveRunCtx(c.var.mainDb, c.var.ppk.projectId);
    if (runCtx === "no_run_attached") return c.json(NO_RUN_ERR);

    let legacyVersion: { moduleLastRun: string; datasetsVersion: string } | undefined;
    if (!runCtx) {
      // Derive moduleId from metricId via DB lookup
      const metricRow = (await c.var.ppk.projectDb<{ module_id: string }[]>`
SELECT module_id FROM metrics WHERE id = ${body.metricId}
`).at(0);
      if (!metricRow) {
        return c.json({ success: false, err: `Unknown metric: ${body.metricId}` });
      }
      const moduleId = metricRow.module_id;

      const moduleLastRun = (
        await c.var.ppk.projectDb<{ last_run_at: string }[]>`
SELECT last_run_at FROM modules WHERE id = ${moduleId}
`
      ).at(0)?.last_run_at;

      if (!moduleLastRun) {
        return c.json({
          success: false,
          err: "Module not found or has not run yet",
        });
      }

      legacyVersion = {
        moduleLastRun,
        datasetsVersion: await getDatasetsVersion(c.var.ppk.projectDb),
      };
    }
    const versionParams: PoDataVersionParams = runCtx
      ? { runId: runCtx.runId }
      : legacyVersion!;

    console.log(
      `[SERVER] Results Value Info ${body.metricId.slice(0, 8)}: REQUEST received`,
    );

    // Check cache BEFORE queueing - prevents duplicates from consuming queue slots
    const existing = await _METRIC_INFO_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        metricId: body.metricId,
        runId: runCtx?.runId,
      },
      versionParams,
    );

    if (existing && existing.success === true) {
      const t1 = performance.now();
      const stats = resultsValueInfoQueue.getStats();
      console.log(
        `[SERVER] Results Value Info ${body.metricId.slice(0, 8)}: HIT (${(
          t1 - t0
        ).toFixed(
          0,
        )}ms) [Queue: ${stats.running}/${stats.maxConcurrent} running, ${stats.queued} waiting]`,
      );
      return c.json(existing);
    }

    // Only queue on cache miss
    const stats = resultsValueInfoQueue.getStats();
    console.log(
      `[SERVER] Results Value Info ${body.metricId.slice(
        0,
        8,
      )}: ENTERING QUEUE [Queue: ${stats.running}/${stats.maxConcurrent} running, ${stats.queued} waiting]`,
    );

    const result = await resultsValueInfoQueue.enqueue(async () => {
      const tQueue = performance.now();
      console.log(
        `[SERVER] Results Value Info ${body.metricId.slice(
          0,
          8,
        )}: EXECUTING (waited ${(tQueue - t0).toFixed(0)}ms in queue)`,
      );

      const newPromise = runCtx
        ? getResultsValueInfoFromRun(
            runCtx,
            c.var.ppk.projectId,
            body.metricId,
          )
        : getResultsValueInfoForPresentationObject(
            c.var.mainDb,
            c.var.ppk.projectDb,
            c.var.ppk.projectId,
            body.metricId,
            legacyVersion!.moduleLastRun,
            legacyVersion!.datasetsVersion,
          );

      _METRIC_INFO_CACHE.setPromise(
        newPromise,
        {
          projectId: c.var.ppk.projectId,
          metricId: body.metricId,
          runId: runCtx?.runId,
        },
        versionParams,
      );

      const res = await newPromise;
      const t1 = performance.now();
      const statsEnd = resultsValueInfoQueue.getStats();
      console.log(
        `[SERVER] Results Value Info ${body.metricId.slice(0, 8)}: MISS (${(
          t1 - t0
        ).toFixed(
          0,
        )}ms) [Queue: ${statsEnd.running}/${statsEnd.maxConcurrent} running, ${statsEnd.queued} waiting]`,
      );
      return res;
    });

    return c.json(result);
  },
);

defineRoute(
  routesPresentationObjects,
  "getReplicantOptions",
  requireProjectPermission("can_view_visualizations"),
  log("getReplicantOptions"),
  async (c, { body }) => {
    // body is attacker-controllable and flows into projectDb.unsafe SQL via
    // getPossibleValues (replicateBy → column ref) and the fetchConfig filters.
    const fetchConfig = body.fetchConfig as GenericLongFormFetchConfig;
    validateFetchConfig(fetchConfig);
    if (!isValidDisaggregationOption(body.replicateBy)) {
      return c.json({ success: false, err: `Invalid replicateBy: ${body.replicateBy}` });
    }

    const t0 = performance.now();
    const filterSummary =
      fetchConfig.filters.length > 0
        ? `${fetchConfig.filters.length} filters`
        : "no filters";

    const runCtx = await resolveRunCtx(c.var.mainDb, c.var.ppk.projectId);
    if (runCtx === "no_run_attached") return c.json(NO_RUN_ERR);

    let moduleId: string;
    let versionInfo: {
      moduleLastRun: string;
      datasetsVersion: string;
      runId?: string;
    };
    if (runCtx) {
      const runModuleId = getModuleIdForResultsObjectFromRun(
        runCtx,
        body.resultsObjectId,
      );
      if (runModuleId === undefined) {
        return c.json({ success: false, err: `Unknown results object: ${body.resultsObjectId}` });
      }
      moduleId = runModuleId;
      versionInfo = getRunVersionInfo(runCtx, moduleId);
    } else {
      // Derive moduleId from resultsObjectId via DB lookup
      const roRow2 = (await c.var.ppk.projectDb<{ module_id: string }[]>`
SELECT module_id FROM results_objects WHERE id = ${body.resultsObjectId}
`).at(0);
      if (!roRow2) {
        return c.json({ success: false, err: `Unknown results object: ${body.resultsObjectId}` });
      }
      moduleId = roRow2.module_id;

      const moduleLastRun = (
        await c.var.ppk.projectDb<{ last_run_at: string }[]>`
SELECT last_run_at FROM modules WHERE id = ${moduleId}
`
      ).at(0)?.last_run_at;

      if (!moduleLastRun) {
        return c.json({
          success: false,
          err: "Module not found or has not run yet",
        });
      }
      versionInfo = {
        moduleLastRun,
        datasetsVersion: await getDatasetsVersion(c.var.ppk.projectDb),
      };
    }
    const versionParams: PoDataVersionParams = runCtx
      ? { runId: runCtx.runId }
      : { moduleLastRun: versionInfo.moduleLastRun, datasetsVersion: versionInfo.datasetsVersion };

    console.log(
      `[SERVER] Replicant Options ${body.resultsObjectId.slice(
        0,
        8,
      )}: REQUEST received (${filterSummary}, replicateBy: ${body.replicateBy})`,
    );

    // Check cache BEFORE queueing
    const existing = await _REPLICANT_OPTIONS_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        resultsObjectId: body.resultsObjectId,
        replicateBy: body.replicateBy,
        fetchConfig: fetchConfig,
        runId: runCtx?.runId,
      },
      versionParams,
    );

    if (existing && existing.success === true) {
      const t1 = performance.now();
      const stats = resultsValueInfoQueue.getStats();
      console.log(
        `[SERVER] Replicant Options ${body.resultsObjectId.slice(0, 8)}: HIT (${(
          t1 - t0
        ).toFixed(
          0,
        )}ms) [Queue: ${stats.running}/${stats.maxConcurrent} running, ${stats.queued} waiting]`,
      );
      return c.json(existing);
    }

    // Only queue on cache miss
    const stats = resultsValueInfoQueue.getStats();
    console.log(
      `[SERVER] Replicant Options ${body.resultsObjectId.slice(
        0,
        8,
      )}: ENTERING QUEUE [Queue: ${stats.running}/${stats.maxConcurrent} running, ${stats.queued} waiting]`,
    );

    const result = await resultsValueInfoQueue.enqueue(async () => {
      const tQueue = performance.now();
      console.log(
        `[SERVER] Replicant Options ${body.resultsObjectId.slice(
          0,
          8,
        )}: EXECUTING (waited ${(tQueue - t0).toFixed(0)}ms in queue)`,
      );

      const newPromise = (async () => {
        // Fetch indicator metadata for label lookup
        const indicatorMetadata = runCtx
          ? await getIndicatorMetadataFromRun(runCtx, moduleId)
          : await getIndicatorMetadata(c.var.mainDb, c.var.ppk.projectDb, moduleId);
        const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));

        // Resolve the period filter to exact bounds the same way the items
        // query does, so relative filters ("last N months") narrow the option
        // list too and from_month re-anchors to the live data — a bounded-only
        // read here would list values the filtered figure can never show.
        // Physical time column inferred like the enricher: period_id >
        // quarter_id > year. (Runs path: the manifest stamp IS the no-filter
        // bounds of the physical column.)
        let periodFilterExactBounds: PeriodBounds | undefined;
        if (fetchConfig.periodFilter) {
          try {
            const rawBounds = runCtx
              ? getRawPeriodBoundsFromRun(runCtx, body.resultsObjectId)
              : await (async () => {
                  const tableName = getResultsObjectTableName(body.resultsObjectId);
                  const hasPeriodId = await detectHasPeriodId(
                    c.var.ppk.projectDb,
                    tableName,
                  );
                  const hasQuarterId =
                    !hasPeriodId &&
                    (await detectColumnExists(c.var.ppk.projectDb, tableName, "quarter_id"));
                  const hasYear =
                    !hasPeriodId &&
                    !hasQuarterId &&
                    (await detectColumnExists(c.var.ppk.projectDb, tableName, "year"));
                  const firstPeriodOption: PeriodOption | undefined = hasPeriodId
                    ? "period_id"
                    : hasQuarterId
                      ? "quarter_id"
                      : hasYear
                        ? "year"
                        : undefined;
                  return await getPeriodBounds(
                    c.var.ppk.projectDb,
                    tableName,
                    [],
                    firstPeriodOption,
                    undefined,
                  );
                })();
            periodFilterExactBounds = getPeriodFilterExactBounds(
              fetchConfig.periodFilter,
              rawBounds,
            );
          } catch (e) {
            return {
              success: true as const,
              data: {
                projectId: c.var.ppk.projectId,
                resultsObjectId: body.resultsObjectId,
                replicateBy: body.replicateBy,
                fetchConfig: fetchConfig,
                ...versionInfo,
                status: "error" as const,
                message: e instanceof Error ? e.message : String(e),
              },
            };
          }
        }

        const resDisPossibleVals = runCtx
          ? await getPossibleValuesFromRun(
              runCtx,
              body.resultsObjectId,
              body.replicateBy,
              labelMap,
              fetchConfig.filters,
              periodFilterExactBounds,
            )
          : await getPossibleValues(
              c.var.ppk.projectDb,
              body.resultsObjectId,
              await getDatasetFamilyForModule(c.var.ppk.projectDb, moduleId),
              body.replicateBy,
              c.var.mainDb,
              labelMap,
              fetchConfig.filters,
              periodFilterExactBounds,
            );

        if (resDisPossibleVals.success === false) {
          return {
            success: true as const,
            data: {
              projectId: c.var.ppk.projectId,
              resultsObjectId: body.resultsObjectId,
              replicateBy: body.replicateBy,
              fetchConfig: fetchConfig,
              ...versionInfo,
              // Surfaced as its own status (matching the metric-info path)
              // instead of masquerading as no_values_available.
              status: "error" as const,
              message: resDisPossibleVals.err,
            },
          };
        }

        const vals = resDisPossibleVals.data;

        if (vals.length > MAX_REPLICANT_OPTIONS) {
          return {
            success: true as const,
            data: {
              projectId: c.var.ppk.projectId,
              resultsObjectId: body.resultsObjectId,
              replicateBy: body.replicateBy,
              fetchConfig: fetchConfig,
              ...versionInfo,
              status: "too_many_values" as const,
            },
          };
        }

        if (vals.length === 0) {
          return {
            success: true as const,
            data: {
              projectId: c.var.ppk.projectId,
              resultsObjectId: body.resultsObjectId,
              replicateBy: body.replicateBy,
              fetchConfig: fetchConfig,
              ...versionInfo,
              status: "no_values_available" as const,
            },
          };
        }

        return {
          success: true as const,
          data: {
            projectId: c.var.ppk.projectId,
            resultsObjectId: body.resultsObjectId,
            replicateBy: body.replicateBy,
            fetchConfig: fetchConfig,
            ...versionInfo,
            status: "ok" as const,
            possibleValues: vals,
          },
        };
      })();

      _REPLICANT_OPTIONS_CACHE.setPromise(
        newPromise,
        {
          projectId: c.var.ppk.projectId,
          resultsObjectId: body.resultsObjectId,
          replicateBy: body.replicateBy,
          fetchConfig: fetchConfig,
          runId: runCtx?.runId,
        },
        versionParams,
      );

      const res = await newPromise;
      const t1 = performance.now();
      const statsEnd = resultsValueInfoQueue.getStats();
      console.log(
        `[SERVER] Replicant Options ${body.resultsObjectId.slice(
          0,
          8,
        )}: MISS (${(t1 - t0).toFixed(
          0,
        )}ms) [Queue: ${statsEnd.running}/${statsEnd.maxConcurrent} running, ${statsEnd.queued} waiting]`,
      );
      return res;
    });

    return c.json(result);
  },
);

