import { Hono } from "hono";
import { Sql } from "postgres";
import {
  isValidDisaggregationOption,
  periodFilterHasBounds,
  syncFigureConfigField,
  syncFigureConfigToMap,
  validateFetchConfig,
} from "lib";
import { applyPoToLiveRoom, closePoRoom } from "../../collab/po_rooms.ts";
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
    const config = body.config as PresentationObjectConfig;
    // Chokepoint: if a live collab room holds this visualization, merge the
    // write into it (collab is authoritative → the field-level merge IS the
    // conflict resolution, so the optimistic-lock check is skipped). The room's
    // checkpoint already persisted, fired notifyLastUpdated and scheduled the
    // viz-list rebroadcast.
    const roomLastUpdated = await applyPoToLiveRoom(
      c.var.ppk.projectId,
      params.po_id,
      (m) => syncFigureConfigToMap(m, config),
    );
    if (roomLastUpdated !== null) {
      return c.json({ success: true, data: { lastUpdated: roomLastUpdated } });
    }

    const res = await updatePresentationObjectConfig(
      c.var.ppk.projectDb,
      params.po_id,
      config,
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
    const projectId = c.var.ppk.projectId;
    const ids: string[] = body.presentationObjectIds;
    const periodFilter = body.periodFilter;

    // Chokepoint: any of these visualizations with a live collab room gets the
    // period-filter change merged into the room (avoids clobbering a peer's
    // in-progress edits); the rest go through the batch DB write.
    const roomHandled = new Set<string>();
    let lastUpdated: string | null = null;
    for (const id of ids) {
      const ts = await applyPoToLiveRoom(
        projectId,
        id,
        (m) => syncFigureConfigField(m, "d", "periodFilter", periodFilter),
      );
      if (ts !== null) {
        roomHandled.add(id);
        lastUpdated = ts;
      }
    }

    const remaining = ids.filter((id) => !roomHandled.has(id));
    if (remaining.length > 0) {
      const res = await batchUpdatePresentationObjectsPeriodFilter(
        c.var.ppk.projectDb,
        remaining,
        periodFilter,
      );
      if (res.success === false) {
        return c.json(res);
      }
      lastUpdated = res.data.lastUpdated;
      notifyLastUpdated(
        projectId,
        "presentation_objects",
        remaining,
        res.data.lastUpdated,
      );
      const vizRes = await getAllPresentationObjectsForProject(c.var.ppk.projectDb);
      if (vizRes.success) {
        notifyProjectVisualizationsUpdated(projectId, vizRes.data);
      }
    }

    return c.json({
      success: true,
      data: {
        lastUpdated: lastUpdated ?? new Date().toISOString(),
        updatedCount: ids.length,
      },
    });
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
    // Discard any live room for the now-deleted PO (its checkpoints would fail
    // against the gone row); connected editors get a po_error and fall back.
    closePoRoom(c.var.ppk.projectId, params.po_id, "Visualization deleted");
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

    const datasetsVersion = await getDatasetsVersion(c.var.ppk.projectDb);

    // Check cache BEFORE queueing - prevents duplicates from consuming queue slots
    const existing = await _PO_ITEMS_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        resultsObjectId: body.resultsObjectId,
        fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
      },
      { moduleLastRun, datasetsVersion },
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
        body.fetchConfig as GenericLongFormFetchConfig,
        body.firstPeriodOption,
        moduleLastRun,
        datasetsVersion,
      );
      _PO_ITEMS_CACHE.setPromise(
        newPromise,
        {
          projectId: c.var.ppk.projectId,
          resultsObjectId: body.resultsObjectId,
          fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
        },
        { moduleLastRun, datasetsVersion },
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

    console.log(
      `[SERVER] Results Value Info ${body.metricId.slice(
        0,
        8,
      )}: REQUEST received (moduleLastRun: ${moduleLastRun})`,
    );

    const datasetsVersion = await getDatasetsVersion(c.var.ppk.projectDb);

    // Check cache BEFORE queueing - prevents duplicates from consuming queue slots
    const existing = await _METRIC_INFO_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        metricId: body.metricId,
      },
      { moduleLastRun, datasetsVersion },
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
        datasetsVersion,
      );

      _METRIC_INFO_CACHE.setPromise(
        newPromise,
        {
          projectId: c.var.ppk.projectId,
          metricId: body.metricId,
        },
        { moduleLastRun, datasetsVersion },
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

    // Derive moduleId from resultsObjectId via DB lookup
    const roRow2 = (await c.var.ppk.projectDb<{ module_id: string }[]>`
SELECT module_id FROM results_objects WHERE id = ${body.resultsObjectId}
`).at(0);
    if (!roRow2) {
      return c.json({ success: false, err: `Unknown results object: ${body.resultsObjectId}` });
    }
    const moduleId = roRow2.module_id;

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

    console.log(
      `[SERVER] Replicant Options ${body.resultsObjectId.slice(
        0,
        8,
      )}: REQUEST received (${filterSummary}, replicateBy: ${body.replicateBy}, moduleLastRun: ${moduleLastRun})`,
    );

    const datasetsVersion = await getDatasetsVersion(c.var.ppk.projectDb);

    // Check cache BEFORE queueing
    const existing = await _REPLICANT_OPTIONS_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        resultsObjectId: body.resultsObjectId,
        replicateBy: body.replicateBy,
        fetchConfig: fetchConfig,
      },
      { moduleLastRun, datasetsVersion },
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
        const indicatorMetadata = await getIndicatorMetadata(c.var.mainDb, c.var.ppk.projectDb, moduleId);
        const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));

        const datasetFamily = await getDatasetFamilyForModule(
          c.var.ppk.projectDb,
          moduleId,
        );

        const resDisPossibleVals = await getPossibleValues(
          c.var.ppk.projectDb,
          body.resultsObjectId,
          datasetFamily,
          body.replicateBy,
          c.var.mainDb,
          labelMap,
          fetchConfig.filters,
          fetchConfig.periodFilter &&
            periodFilterHasBounds(fetchConfig.periodFilter)
            ? {
                min: fetchConfig.periodFilter.min,
                max: fetchConfig.periodFilter.max,
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
              fetchConfig: fetchConfig,
              moduleLastRun,
              datasetsVersion,
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
              fetchConfig: fetchConfig,
              moduleLastRun,
              datasetsVersion,
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
              moduleLastRun,
              datasetsVersion,
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
            moduleLastRun,
            datasetsVersion,
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
        },
        { moduleLastRun, datasetsVersion },
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

