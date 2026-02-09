import { Hono } from "hono";
import {
  getModuleIdForMetric,
  getModuleIdForResultsObject,
  validateFetchConfig,
} from "lib";
import {
  addPresentationObject,
  batchUpdatePresentationObjectsPeriodFilter,
  deleteAIPresentationObject,
  deletePresentationObject,
  duplicatePresentationObject,
  getAllPresentationObjectsForProject,
  getPresentationObjectDetail,
  updateAIPresentationObject,
  updatePresentationObjectConfig,
  updatePresentationObjectLabel,
} from "../../db/mod.ts";
import { log } from "../../middleware/mod.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { MAX_REPLICANT_OPTIONS } from "../../server_only_funcs_presentation_objects/consts.ts";
import {
  getPossibleValues,
  getPresentationObjectItems,
  getResultsValueInfoForPresentationObject,
} from "../../server_only_funcs_presentation_objects/mod.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { notifyProjectUpdated } from "../../task_management/notify_last_updated.ts";
import { RequestQueue } from "../../utils/request_queue.ts";
import {
  _METRIC_INFO_CACHE,
  _PO_DETAIL_CACHE,
  _PO_ITEMS_CACHE,
  _REPLICANT_OPTIONS_CACHE,
} from "../caches/visualizations.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesPresentationObjects = new Hono();

// Queue to limit concurrent PO items requests
// With 20 DB connections, allow 10 concurrent PO items queries
// This leaves headroom for auth and other lightweight queries
const poItemsQueue = new RequestQueue(10);

// Queue for Variable Info requests
// These are lighter queries, but still need limiting during burst loads
const resultsValueInfoQueue = new RequestQueue(15);

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
      resultsValue: body.resultsValue,
      config: body.config,
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
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
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
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
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

    // Check cache
    const existing = await _PO_DETAIL_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        presentationObjectId: params.po_id,
      },
      { presentationObjectLastUpdated: poData.last_updated },
    );

    if (existing) {
      const t1 = performance.now();
      console.log(
        `[SERVER] PO Detail ${params.po_id.slice(0, 8)}: HIT (${(
          t1 - t0
        ).toFixed(0)}ms)`,
      );
      return c.json(existing);
    }

    // Cache miss - fetch and store
    const newPromise = getPresentationObjectDetail(
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
      { presentationObjectLastUpdated: poData.last_updated },
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
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
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
      body.config,
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
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      res.data.reportItemsThatDependOnPresentationObjects,
      res.data.lastUpdated,
    );
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
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

      if (res.data.reportItemsAffected.length > 0) {
        notifyLastUpdated(
          c.var.ppk.projectId,
          "report_items",
          res.data.reportItemsAffected,
          res.data.lastUpdated,
        );
      }

      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
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
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
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
    validateFetchConfig(body.fetchConfig);

    // Derive moduleId from resultsObjectId (works for both real POs and ad-hoc AI queries)
    const moduleId = getModuleIdForResultsObject(body.resultsObjectId);

    const moduleLastRun = (
      await c.var.ppk.projectDb<{ last_run: string }[]>`
SELECT last_run FROM modules WHERE id = ${moduleId}
`
    ).at(0)?.last_run;

    if (!moduleLastRun) {
      return c.json({
        success: false,
        err: "Module not found or has not run yet",
      });
    }

    // Check cache BEFORE queueing - prevents duplicates from consuming queue slots
    const existing = await _PO_ITEMS_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        resultsObjectId: body.resultsObjectId,
        fetchConfig: body.fetchConfig,
      },
      { moduleLastRun },
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
      const newPromise = getPresentationObjectItems(
        c.var.mainDb,
        c.var.ppk.projectId,
        c.var.ppk.projectDb,
        body.resultsObjectId,
        body.fetchConfig,
        body.firstPeriodOption,
        moduleLastRun,
      );
      _PO_ITEMS_CACHE.setPromise(
        newPromise,
        {
          projectId: c.var.ppk.projectId,
          resultsObjectId: body.resultsObjectId,
          fetchConfig: body.fetchConfig,
        },
        { moduleLastRun },
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

    // Derive moduleId from metricId
    const moduleId = getModuleIdForMetric(body.metricId);

    // Read moduleLastRun from DB
    const moduleLastRun = (
      await c.var.ppk.projectDb<{ last_run: string }[]>`
SELECT last_run FROM modules WHERE id = ${moduleId}
`
    ).at(0)?.last_run;

    if (!moduleLastRun) {
      return c.json({
        success: false,
        err: "Module not found or has not run yet",
      });
    }

    console.log(
      `[SERVER] Results Value Info ${body.metricId.slice(
        0,
        8,
      )}: REQUEST received (moduleLastRun: ${moduleLastRun})`,
    );

    // Check cache BEFORE queueing - prevents duplicates from consuming queue slots
    const existing = await _METRIC_INFO_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        metricId: body.metricId,
      },
      { moduleLastRun },
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

      const newPromise = getResultsValueInfoForPresentationObject(
        c.var.mainDb,
        c.var.ppk.projectDb,
        c.var.ppk.projectId,
        body.metricId,
        moduleLastRun,
      );

      _METRIC_INFO_CACHE.setPromise(
        newPromise,
        {
          projectId: c.var.ppk.projectId,
          metricId: body.metricId,
        },
        { moduleLastRun },
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
    const t0 = performance.now();
    const filterSummary =
      body.fetchConfig.filters.length > 0
        ? `${body.fetchConfig.filters.length} filters`
        : "no filters";

    // Derive moduleId from resultsObjectId
    const moduleId = getModuleIdForResultsObject(body.resultsObjectId);

    // Read moduleLastRun from DB
    const moduleLastRun = (
      await c.var.ppk.projectDb<{ last_run: string }[]>`
SELECT last_run FROM modules WHERE id = ${moduleId}
`
    ).at(0)?.last_run;

    if (!moduleLastRun) {
      return c.json({
        success: false,
        err: "Module not found or has not run yet",
      });
    }

    console.log(
      `[SERVER] Replicant Options ${body.resultsObjectId.slice(
        0,
        8,
      )}: REQUEST received (${filterSummary}, replicateBy: ${body.replicateBy}, moduleLastRun: ${moduleLastRun})`,
    );

    // Check cache BEFORE queueing
    const existing = await _REPLICANT_OPTIONS_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        resultsObjectId: body.resultsObjectId,
        replicateBy: body.replicateBy,
        fetchConfig: body.fetchConfig,
      },
      { moduleLastRun },
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
        const resDisPossibleVals = await getPossibleValues(
          c.var.ppk.projectDb,
          body.resultsObjectId,
          body.replicateBy,
          c.var.mainDb,
          body.fetchConfig.filters,
          body.fetchConfig.periodFilter
            ? {
                periodOption: body.fetchConfig.periodFilter.periodOption,
                min: body.fetchConfig.periodFilter.min,
                max: body.fetchConfig.periodFilter.max,
              }
            : undefined,
        );

        if (resDisPossibleVals.success === false) {
          return {
            success: true as const,
            data: {
              projectId: c.var.ppk.projectId,
              resultsObjectId: body.resultsObjectId,
              replicateBy: body.replicateBy,
              fetchConfig: body.fetchConfig,
              moduleLastRun,
              status: "no_values_available" as const,
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
              fetchConfig: body.fetchConfig,
              moduleLastRun,
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
              fetchConfig: body.fetchConfig,
              moduleLastRun,
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
            fetchConfig: body.fetchConfig,
            moduleLastRun,
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
          fetchConfig: body.fetchConfig,
        },
        { moduleLastRun },
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

defineRoute(
  routesPresentationObjects,
  "deleteAIVisualization",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  async (c, { params }) => {
    const res = await deleteAIPresentationObject(
      c.var.ppk.projectDb,
      params.po_id,
    );
    if (!res.success) {
      return c.json(res);
    }
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "updateAIVisualization",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  async (c, { params, body }) => {
    const res = await updateAIPresentationObject(
      c.var.ppk.projectDb,
      params.po_id,
      body,
    );
    if (!res.success) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "presentation_objects",
      [params.po_id],
      res.data.lastUpdated,
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      res.data.reportItemsThatDependOnPresentationObjects,
      res.data.lastUpdated,
    );
    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    return c.json(res);
  },
);
