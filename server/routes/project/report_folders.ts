import { Hono } from "hono";
import {
  createReportFolder,
  deleteReportFolder,
  getAllReportFolders,
  updateReportFolder,
} from "../../db/project/report_folders.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { notifyProjectReportFoldersUpdated } from "../../task_management/notify_project_v2.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesReportFolders = new Hono();

defineRoute(
  routesReportFolders,
  "createReportFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { body }) => {
    const res = await createReportFolder(
      c.var.ppk.projectDb,
      body.label,
      body.color,
      body.description,
    );
    if (res.success) {
      const foldersRes = await getAllReportFolders(c.var.ppk.projectDb);
      if (foldersRes.success) {
        notifyProjectReportFoldersUpdated(c.var.ppk.projectId, foldersRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesReportFolders,
  "updateReportFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await updateReportFolder(
      c.var.ppk.projectDb,
      params.folder_id,
      body.label,
      body.color,
      body.description,
    );
    if (res.success) {
      const foldersRes = await getAllReportFolders(c.var.ppk.projectDb);
      if (foldersRes.success) {
        notifyProjectReportFoldersUpdated(c.var.ppk.projectId, foldersRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesReportFolders,
  "deleteReportFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params }) => {
    const res = await deleteReportFolder(
      c.var.ppk.projectDb,
      params.folder_id,
    );
    if (res.success) {
      const foldersRes = await getAllReportFolders(c.var.ppk.projectDb);
      if (foldersRes.success) {
        notifyProjectReportFoldersUpdated(c.var.ppk.projectId, foldersRes.data);
      }
    }
    return c.json(res);
  },
);
