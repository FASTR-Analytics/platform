import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  getPeriodFilterExactBounds,
  isValidDisaggregationOption,
  syncFigureConfigField,
  syncFigureConfigToMap,
  validateFetchConfig,
  type PeriodBounds,
} from "lib";
import { applyPoToLiveRoom, closePoRoom } from "../../collab/po_rooms.ts";
import {
  addPresentationObject,
  batchUpdatePresentationObjectsPeriodFilter,
  deletePresentationObject,
  duplicatePresentationObject,
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
import { exceedsMaxReplicantOptions } from "../../server_only_funcs_presentation_objects/consts.ts";
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
import {
  findMissingRequiredGroupBys,
  findVirtualDefault,
  getAllPresentationObjectsWithVirtualDefaults,
  getAttachedManifestOrNull,
  getIndicatorMetadataFromRun,
  getModuleIdForMetricFromRun,
  getModuleIdForResultsObjectFromRun,
  getPossibleValuesFromRun,
  getPresentationObjectDetailFromRun,
  getPresentationObjectItemsFromRun,
  getRawPeriodBoundsFromRun,
  getResultsValueInfoFromRun,
  getRunReadContext,
  getRunVersionInfo,
  VIRTUAL_DEFAULT_LAST_UPDATED,
} from "../../run_query/mod.ts";

// Every data read in this file serves from the project's attached immutable
// run (PLAN_RESULTS_RUNS): manifest for all metadata, DuckDB over the run's
// parquet for all data queries, caches keyed on the runId. A project with no
// run attached errors loudly until its backfill synthesis / first generation
// completes. The Postgres read functions stay in-tree solely as the parity
// rig's baseline.

export const routesPresentationObjects = new Hono();

// Queue to limit concurrent PO items requests
// With 20 DB connections, allow 10 concurrent PO items queries
// This leaves headroom for auth and other lightweight queries
const poItemsQueue = new RequestQueue(10);

// Queue for Variable Info requests
// These are lighter queries, but still need limiting during burst loads
const resultsValueInfoQueue = new RequestQueue(15);

// Virtual defaults (PLAN_RESULTS_RUNS item 5b) have no row: writes against
// them are refused with the same messages the row guards used, and the
// listing/detail surfaces resolve them from the attached run's manifest.
async function isVirtualDefaultId(
  mainDb: Sql,
  projectId: string,
  presentationObjectId: string,
): Promise<boolean> {
  const manifest = await getAttachedManifestOrNull(mainDb, projectId);
  return manifest !== null &&
    findVirtualDefault(manifest, presentationObjectId) !== undefined;
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
    const vizRes = await getAllPresentationObjectsWithVirtualDefaults(
      c.var.mainDb,
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
    );
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
    // Duplicating a virtual default (item 5b) IS the customize path — resolve
    // the manifest projection so the copy materializes as a user row.
    const manifest = await getAttachedManifestOrNull(
      c.var.mainDb,
      c.var.ppk.projectId,
    );
    const virtualSource = manifest
      ? findVirtualDefault(manifest, params.po_id)
      : undefined;
    const res = await duplicatePresentationObject(
      c.var.ppk.projectDb,
      params.po_id,
      body.label,
      body.folderId,
      virtualSource ?? null,
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
    const vizRes = await getAllPresentationObjectsWithVirtualDefaults(
      c.var.mainDb,
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
    );
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
    const res = await getAllPresentationObjectsWithVirtualDefaults(
      c.var.mainDb,
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
    );
    return c.json(res);
  },
);

defineRoute(
  routesPresentationObjects,
  "getPresentationObjectDetail",
  requireProjectPermission("can_view_visualizations"),
  async (c, { params }) => {
    const t0 = performance.now();

    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    const runCtx = ctxRes.data;

    // Version key: the row's last_updated, or the constant sentinel for a
    // virtual default (item 5b — no row exists; the run is immutable so the
    // runId in the version is the whole identity).
    const poData = (
      await c.var.ppk.projectDb<{ last_updated: string }[]>`
        SELECT last_updated FROM presentation_objects WHERE id = ${params.po_id}
      `
    ).at(0);

    if (!poData && findVirtualDefault(runCtx.manifest, params.po_id) === undefined) {
      return c.json({ success: false, err: "Presentation object not found" });
    }
    const poLastUpdated = poData?.last_updated ?? VIRTUAL_DEFAULT_LAST_UPDATED;

    // Check cache
    const existing = await _PO_DETAIL_CACHE.get(
      {
        projectId: c.var.ppk.projectId,
        presentationObjectId: params.po_id,
      },
      {
        presentationObjectLastUpdated: poLastUpdated,
        runId: runCtx.runId,
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
                config: presentationObjectConfigSchema.parse(
                  existing.data.config,
                ),
              },
            }
          : existing,
      );
    }

    // Cache miss - fetch and store
    const newPromise = getPresentationObjectDetailFromRun(
      runCtx,
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
      params.po_id,
    );

    _PO_DETAIL_CACHE.setPromise(
      newPromise,
      {
        projectId: c.var.ppk.projectId,
        presentationObjectId: params.po_id,
      },
      {
        presentationObjectLastUpdated: poLastUpdated,
        runId: runCtx.runId,
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
    if (await isVirtualDefaultId(c.var.mainDb, c.var.ppk.projectId, params.po_id)) {
      return c.json({
        success: false,
        err: "You cannot update a default visualization",
      });
    }
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
    const vizRes = await getAllPresentationObjectsWithVirtualDefaults(
      c.var.mainDb,
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
    );
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
    if (await isVirtualDefaultId(c.var.mainDb, c.var.ppk.projectId, params.po_id)) {
      return c.json({
        success: false,
        err: "You cannot update a default visualization",
      });
    }
    const config = body.config as PresentationObjectConfig;
    // Chokepoint: if a live collab room holds this visualization, merge the
    // write into it (collab is authoritative → the field-level merge IS the
    // conflict resolution, so the optimistic-lock check is skipped). The room's
    // checkpoint already persisted, fired notifyLastUpdated and scheduled the
    // viz-list rebroadcast.
    const roomRes = await applyPoToLiveRoom(
      c.var.ppk.projectId,
      params.po_id,
      (m) => syncFigureConfigToMap(m, config),
    );
    if (roomRes.status === "saved") {
      return c.json({
        success: true,
        data: { lastUpdated: roomRes.lastUpdated },
      });
    }
    if (roomRes.status === "save_failed") {
      // The room applied the change (peers already see it) but could not
      // persist it. Do NOT fall back to a direct DB write — the room owns
      // persistence and its next successful checkpoint would clobber it.
      return c.json({
        success: false as const,
        err: "The change was applied to the live editing session but could not be saved yet. Saving will retry automatically.",
      });
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
    const vizRes = await getAllPresentationObjectsWithVirtualDefaults(
      c.var.mainDb,
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
    );
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
    // Virtual defaults have no row and must be refused BEFORE any live-room
    // application, so the room merges and the DB write always operate on the
    // same id set (the pre-runs version of this route partially applied a
    // mixed batch to rooms and then errored — see PLAN_RESULTS_RUNS
    // "Inherited defect").
    const manifest = await getAttachedManifestOrNull(
      c.var.mainDb,
      c.var.ppk.projectId,
    );
    if (
      manifest &&
      body.presentationObjectIds.some(
        (id) => findVirtualDefault(manifest, id) !== undefined,
      )
    ) {
      return c.json({
        success: false,
        err: "You cannot update a default visualization",
      });
    }
    const projectId = c.var.ppk.projectId;
    const ids: string[] = body.presentationObjectIds;
    const periodFilter = body.periodFilter;

    // Chokepoint: any of these visualizations with a live collab room gets the
    // period-filter change merged into the room (avoids clobbering a peer's
    // in-progress edits); the rest go through the batch DB write.
    const roomHandled = new Set<string>();
    const saveFailedIds: string[] = [];
    let lastUpdated: string | null = null;
    for (const id of ids) {
      const roomRes = await applyPoToLiveRoom(projectId, id, (m) =>
        syncFigureConfigField(m, "d", "periodFilter", periodFilter),
      );
      // save_failed still counts as room-handled: the room absorbed the change
      // (peers see it) and owns persisting it — a direct DB write here would
      // be clobbered by the room's next successful checkpoint.
      if (roomRes.status !== "no_room") {
        roomHandled.add(id);
        if (roomRes.status === "saved") {
          lastUpdated = roomRes.lastUpdated;
        } else {
          saveFailedIds.push(id);
        }
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
      const vizRes = await getAllPresentationObjectsWithVirtualDefaults(
        c.var.mainDb,
        projectId,
        c.var.ppk.projectDb,
      );
      if (vizRes.success) {
        notifyProjectVisualizationsUpdated(projectId, vizRes.data);
      }
    }

    if (saveFailedIds.length > 0) {
      // The rooms absorbed the change (peers already see it) but could not
      // persist it — matching updatePresentationObjectConfig above, report
      // the failure instead of claiming success with a synthetic timestamp.
      return c.json({
        success: false as const,
        err:
          `The period filter was applied to ${saveFailedIds.length} live editing session(s) but could not be saved yet. Saving will retry automatically.`,
      });
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
    if (await isVirtualDefaultId(c.var.mainDb, c.var.ppk.projectId, params.po_id)) {
      return c.json({
        success: false,
        err: "You cannot delete a default visualization",
      });
    }
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
    const vizRes = await getAllPresentationObjectsWithVirtualDefaults(
      c.var.mainDb,
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
    );
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

    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    const runCtx = ctxRes.data;

    const moduleId = getModuleIdForResultsObjectFromRun(
      runCtx,
      body.resultsObjectId,
    );
    if (moduleId === undefined) {
      return c.json({
        success: false,
        err: `Unknown results object: ${body.resultsObjectId}`,
      });
    }
    const versionParams = getRunVersionInfo(runCtx, moduleId);
    if (versionParams.moduleLastRun === "unknown") {
      return c.json({
        success: false,
        err: "Module not found or has not run yet",
      });
    }

    const missingRequired = findMissingRequiredGroupBys(
      runCtx,
      body.resultsObjectId,
      (body.fetchConfig as GenericLongFormFetchConfig).groupBys,
    );
    if (missingRequired.length > 0) {
      return c.json({
        success: false,
        err: `Required disaggregation option(s) not grouped: ${missingRequired.join(", ")}`,
      });
    }

    // Check cache BEFORE queueing - prevents duplicates from consuming queue slots
    const existing = await _PO_ITEMS_CACHE.get(
      {
        runId: runCtx.runId,
        resultsObjectId: body.resultsObjectId,
        fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
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
      // Derived from the manifest, never from the client: the value shapes
      // period-bound resolution but is absent from the cache hash, so a stale
      // client detail (from a previously attached run) would poison this
      // run's shared cache entry. physicalTimeColumn IS the most granular
      // period column (the derivation inferMostGranularTimePeriodColumn
      // reduces to it on the run plane).
      const firstPeriodOption =
        runCtx.manifest.resultsObjects.find(
          (ro) => ro.id === body.resultsObjectId,
        )?.physicalTimeColumn ?? undefined;
      const newPromise = getPresentationObjectItemsFromRun(
        runCtx,
        c.var.ppk.projectId,
        body.resultsObjectId,
        body.fetchConfig as GenericLongFormFetchConfig,
        firstPeriodOption,
      );
      _PO_ITEMS_CACHE.setPromise(
        newPromise,
        {
          runId: runCtx.runId,
          resultsObjectId: body.resultsObjectId,
          fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
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

    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    const runCtx = ctxRes.data;

    const moduleId = getModuleIdForMetricFromRun(runCtx, body.metricId);
    if (moduleId === undefined) {
      return c.json({ success: false, err: `Unknown metric: ${body.metricId}` });
    }
    const versionParams = getRunVersionInfo(runCtx, moduleId);
    if (versionParams.moduleLastRun === "unknown") {
      return c.json({
        success: false,
        err: "Module not found or has not run yet",
      });
    }

    console.log(
      `[SERVER] Results Value Info ${body.metricId.slice(0, 8)}: REQUEST received`,
    );

    // Check cache BEFORE queueing - prevents duplicates from consuming queue slots
    const existing = await _METRIC_INFO_CACHE.get(
      {
        runId: runCtx.runId,
        metricId: body.metricId,
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

      const newPromise = getResultsValueInfoFromRun(
        runCtx,
        c.var.ppk.projectId,
        body.metricId,
      );

      _METRIC_INFO_CACHE.setPromise(
        newPromise,
        {
          runId: runCtx.runId,
          metricId: body.metricId,
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
  async (c, { body }) => {
    // body is attacker-controllable and flows into generated SQL via
    // getPossibleValues (replicateBy → column ref) and the fetchConfig filters.
    const fetchConfig = body.fetchConfig as GenericLongFormFetchConfig;
    validateFetchConfig(fetchConfig);
    if (!isValidDisaggregationOption(body.replicateBy)) {
      return c.json({
        success: false,
        err: `Invalid replicateBy: ${body.replicateBy}`,
      });
    }

    const t0 = performance.now();
    const filterSummary =
      fetchConfig.filters.length > 0
        ? `${fetchConfig.filters.length} filters`
        : "no filters";

    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    const runCtx = ctxRes.data;

    const moduleId = getModuleIdForResultsObjectFromRun(
      runCtx,
      body.resultsObjectId,
    );
    if (moduleId === undefined) {
      return c.json({
        success: false,
        err: `Unknown results object: ${body.resultsObjectId}`,
      });
    }
    const versionInfo = getRunVersionInfo(runCtx, moduleId);
    if (versionInfo.moduleLastRun === "unknown") {
      return c.json({
        success: false,
        err: "Module not found or has not run yet",
      });
    }

    console.log(
      `[SERVER] Replicant Options ${body.resultsObjectId.slice(
        0,
        8,
      )}: REQUEST received (${filterSummary}, replicateBy: ${body.replicateBy})`,
    );

    // Check cache BEFORE queueing
    const existing = await _REPLICANT_OPTIONS_CACHE.get(
      {
        runId: runCtx.runId,
        resultsObjectId: body.resultsObjectId,
        replicateBy: body.replicateBy,
        fetchConfig: fetchConfig,
      },
      versionInfo,
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
        const indicatorMetadata = getIndicatorMetadataFromRun(
          runCtx,
          moduleId,
        );
        const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));

        // Resolve the period filter to exact bounds the same way the items
        // query does, so relative filters ("last N months") narrow the option
        // list too and from_month re-anchors to the live data — a bounded-only
        // read here would list values the filtered figure can never show. The
        // manifest stamp IS the no-filter bounds of the physical time column.
        let periodFilterExactBounds: PeriodBounds | undefined;
        if (fetchConfig.periodFilter) {
          try {
            const rawBounds = getRawPeriodBoundsFromRun(
              runCtx,
              body.resultsObjectId,
            );
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

        const resDisPossibleVals = await getPossibleValuesFromRun(
          runCtx,
          body.resultsObjectId,
          body.replicateBy,
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

        if (exceedsMaxReplicantOptions(vals)) {
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
          runId: runCtx.runId,
          resultsObjectId: body.resultsObjectId,
          replicateBy: body.replicateBy,
          fetchConfig: fetchConfig,
        },
        versionInfo,
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
