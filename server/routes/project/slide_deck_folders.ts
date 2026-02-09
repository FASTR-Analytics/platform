import { Hono } from "hono";
import {
  createSlideDeckFolder,
  updateSlideDeckFolder,
  deleteSlideDeckFolder,
} from "../../db/project/slide_deck_folders.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { notifyProjectUpdated } from "../../task_management/notify_last_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesSlideDeckFolders = new Hono();

defineRoute(
  routesSlideDeckFolders,
  "createSlideDeckFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { body }) => {
    const res = await createSlideDeckFolder(
      c.var.ppk.projectDb,
      body.label,
      body.color,
      body.description,
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  },
);

defineRoute(
  routesSlideDeckFolders,
  "updateSlideDeckFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await updateSlideDeckFolder(
      c.var.ppk.projectDb,
      params.folder_id,
      body.label,
      body.color,
      body.description,
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  },
);

defineRoute(
  routesSlideDeckFolders,
  "deleteSlideDeckFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params }) => {
    const res = await deleteSlideDeckFolder(
      c.var.ppk.projectDb,
      params.folder_id,
    );
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);
    }
    return c.json(res);
  },
);
