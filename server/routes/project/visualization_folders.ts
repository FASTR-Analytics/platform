import { Hono } from "hono";
import {
  createVisualizationFolder,
  updateVisualizationFolder,
  deleteVisualizationFolder,
  reorderVisualizationFolders,
} from "../../db/project/visualization_folders.ts";
import {
  updatePresentationObjectFolder,
  reorderPresentationObjects,
} from "../../db/project/presentation_objects.ts";
import { getProjectEditor } from "../../project_auth.ts";
import { notifyProjectUpdated } from "../../task_management/notify_last_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesVisualizationFolders = new Hono();

defineRoute(
  routesVisualizationFolders,
  "createVisualizationFolder",
  getProjectEditor,
  async (c, { body }) => {
    const res = await createVisualizationFolder(
      c.var.ppk.projectDb,
      body.label,
      body.color,
      body.description
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  }
);

defineRoute(
  routesVisualizationFolders,
  "updateVisualizationFolder",
  getProjectEditor,
  async (c, { params, body }) => {
    const res = await updateVisualizationFolder(
      c.var.ppk.projectDb,
      params.folder_id,
      body.label,
      body.color,
      body.description
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  }
);

defineRoute(
  routesVisualizationFolders,
  "deleteVisualizationFolder",
  getProjectEditor,
  async (c, { params }) => {
    const res = await deleteVisualizationFolder(
      c.var.ppk.projectDb,
      params.folder_id
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  }
);

defineRoute(
  routesVisualizationFolders,
  "reorderVisualizationFolders",
  getProjectEditor,
  async (c, { body }) => {
    const res = await reorderVisualizationFolders(
      c.var.ppk.projectDb,
      body.folderIds
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  }
);

defineRoute(
  routesVisualizationFolders,
  "updatePresentationObjectFolder",
  getProjectEditor,
  async (c, { params, body }) => {
    const res = await updatePresentationObjectFolder(
      c.var.ppk.projectDb,
      params.po_id,
      body.folderId
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  }
);

defineRoute(
  routesVisualizationFolders,
  "reorderPresentationObjects",
  getProjectEditor,
  async (c, { body }) => {
    const res = await reorderPresentationObjects(
      c.var.ppk.projectDb,
      body.orderUpdates
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  }
);
