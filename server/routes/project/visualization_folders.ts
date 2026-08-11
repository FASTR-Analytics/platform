import { Hono } from "hono";
import {
  createVisualizationFolder,
  updateVisualizationFolder,
  deleteVisualizationFolder,
  reorderVisualizationFolders,
  getAllVisualizationFolders,
} from "../../db/project/visualization_folders.ts";
import {
  updatePresentationObjectFolder,
  reorderPresentationObjects,
} from "../../db/project/presentation_objects.ts";
import {
  findVirtualDefault,
  getAllPresentationObjectsWithVirtualDefaults,
  getAttachedManifestOrNull,
} from "../../run_query/mod.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import {
  notifyProjectVisualizationFoldersUpdated,
  notifyProjectVisualizationsUpdated,
} from "../../task_management/notify_project_v2.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesVisualizationFolders = new Hono();

defineRoute(
  routesVisualizationFolders,
  "createVisualizationFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  async (c, { body }) => {
    const res = await createVisualizationFolder(
      c.var.ppk.projectDb,
      body.label,
      body.color,
      body.description,
    );
    if (res.success) {
      const foldersRes = await getAllVisualizationFolders(c.var.ppk.projectDb);
      if (foldersRes.success) {
        notifyProjectVisualizationFoldersUpdated(c.var.ppk.projectId, foldersRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesVisualizationFolders,
  "updateVisualizationFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  async (c, { params, body }) => {
    const res = await updateVisualizationFolder(
      c.var.ppk.projectDb,
      params.folder_id,
      body.label,
      body.color,
      body.description,
    );
    if (res.success) {
      const foldersRes = await getAllVisualizationFolders(c.var.ppk.projectDb);
      if (foldersRes.success) {
        notifyProjectVisualizationFoldersUpdated(c.var.ppk.projectId, foldersRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesVisualizationFolders,
  "deleteVisualizationFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  async (c, { params }) => {
    const res = await deleteVisualizationFolder(
      c.var.ppk.projectDb,
      params.folder_id,
    );
    if (res.success) {
      const foldersRes = await getAllVisualizationFolders(c.var.ppk.projectDb);
      if (foldersRes.success) {
        notifyProjectVisualizationFoldersUpdated(c.var.ppk.projectId, foldersRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesVisualizationFolders,
  "reorderVisualizationFolders",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  async (c, { body }) => {
    const res = await reorderVisualizationFolders(
      c.var.ppk.projectDb,
      body.folderIds,
    );
    if (res.success) {
      const foldersRes = await getAllVisualizationFolders(c.var.ppk.projectDb);
      if (foldersRes.success) {
        notifyProjectVisualizationFoldersUpdated(c.var.ppk.projectId, foldersRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesVisualizationFolders,
  "updatePresentationObjectFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  async (c, { params, body }) => {
    // Virtual defaults (item 5b) have no row and no folder — refuse like the
    // other write guards rather than no-op'ing the UPDATE.
    const manifest = await getAttachedManifestOrNull(
      c.var.mainDb,
      c.var.ppk.projectId,
    );
    if (manifest && findVirtualDefault(manifest, params.po_id) !== undefined) {
      return c.json({
        success: false,
        err: "You cannot update a default visualization",
      });
    }
    const res = await updatePresentationObjectFolder(
      c.var.ppk.projectDb,
      params.po_id,
      body.folderId,
    );
    if (res.success) {
      const vizRes = await getAllPresentationObjectsWithVirtualDefaults(
        c.var.mainDb,
        c.var.ppk.projectId,
        c.var.ppk.projectDb,
      );
      if (vizRes.success) {
        notifyProjectVisualizationsUpdated(c.var.ppk.projectId, vizRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesVisualizationFolders,
  "reorderPresentationObjects",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_visualizations",
  ),
  async (c, { body }) => {
    const res = await reorderPresentationObjects(
      c.var.ppk.projectDb,
      body.orderUpdates,
    );
    if (res.success) {
      const vizRes = await getAllPresentationObjectsWithVirtualDefaults(
        c.var.mainDb,
        c.var.ppk.projectId,
        c.var.ppk.projectDb,
      );
      if (vizRes.success) {
        notifyProjectVisualizationsUpdated(c.var.ppk.projectId, vizRes.data);
      }
    }
    return c.json(res);
  },
);
