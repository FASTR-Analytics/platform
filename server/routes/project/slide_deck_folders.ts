import { Hono } from "hono";
import {
  createSlideDeckFolder,
  updateSlideDeckFolder,
  deleteSlideDeckFolder,
} from "../../db/project/slide_deck_folders.ts";
import { getProjectEditor } from "../../project_auth.ts";
import { notifyProjectUpdated } from "../../task_management/notify_last_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesSlideDeckFolders = new Hono();

defineRoute(
  routesSlideDeckFolders,
  "createSlideDeckFolder",
  getProjectEditor,
  async (c, { body }) => {
    const res = await createSlideDeckFolder(
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
  routesSlideDeckFolders,
  "updateSlideDeckFolder",
  getProjectEditor,
  async (c, { params, body }) => {
    const res = await updateSlideDeckFolder(
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
  routesSlideDeckFolders,
  "deleteSlideDeckFolder",
  getProjectEditor,
  async (c, { params }) => {
    const res = await deleteSlideDeckFolder(
      c.var.ppk.projectDb,
      params.folder_id
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  }
);
