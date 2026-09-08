import { Hono } from "hono";
import type { Sql } from "postgres";
import { syncFigureConfigField, syncFigureConfigToMap } from "lib";
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
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { notifyProjectVisualizationsUpdated } from "../../task_management/notify_project_v2.ts";
import { _PO_DETAIL_CACHE } from "../caches/visualizations.ts";
import { defineRoute } from "../route-helpers.ts";
import {
  findVirtualDefault,
  getAllPresentationObjectsWithVirtualDefaults,
  getAttachedManifestOrNull,
  getPresentationObjectDetailFromRun,
  getRunReadContext,
  readRunItems,
  readRunReplicantOptions,
  readRunResultsValueInfo,
  VIRTUAL_DEFAULT_LAST_UPDATED,
} from "../../run_query/mod.ts";

// Every data read in this file serves from the project's attached immutable
// run: manifest for all metadata, DuckDB over the run's parquet for all data
// queries, caches keyed on the runId. A project with no run attached errors
// loudly until its first generation completes.

export const routesPresentationObjects = new Hono();

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
    // Duplicating a virtual default (item 5b) IS the customize path: resolve
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
    // virtual default (item 5b: no row exists; the run is immutable so the
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
        scopeToken: runCtx.scopeToken,
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
        scopeToken: runCtx.scopeToken,
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
      // persist it. Do NOT fall back to a direct DB write: the room owns
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
    // mixed batch to rooms and then errored: see PLAN_RESULTS_RUNS
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
      // (peers see it) and owns persisting it: a direct DB write here would
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
      // persist it: matching updatePresentationObjectConfig above, report
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
    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(
      await readRunItems(ctxRes.data, {
        resultsObjectId: body.resultsObjectId,
        fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
      }),
    );
  },
);

defineRoute(
  routesPresentationObjects,
  "getResultsValueInfoForPresentationObject",
  requireProjectPermission("can_view_visualizations"),
  async (c, { body }) => {
    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    return c.json(await readRunResultsValueInfo(ctxRes.data, body.metricId));
  },
);

defineRoute(
  routesPresentationObjects,
  "getReplicantOptions",
  requireProjectPermission("can_view_visualizations"),
  async (c, { body }) => {
    const ctxRes = await getRunReadContext(c.var.mainDb, c.var.ppk.projectId);
    if (ctxRes.success === false) return c.json(ctxRes);
    const res = await readRunReplicantOptions(ctxRes.data, {
      resultsObjectId: body.resultsObjectId,
      replicateBy: body.replicateBy,
      fetchConfig: body.fetchConfig as GenericLongFormFetchConfig,
    });
    if (res.success === false) return c.json(res);
    return c.json({
      success: true as const,
      data: { projectId: c.var.ppk.projectId, ...res.data },
    });
  },
);
