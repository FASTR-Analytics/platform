import { Hono } from "hono";
import {
  createReport,
  deleteReport,
  duplicateReport,
  getAllReports,
  getReportDetail,
  moveReportToFolder,
  updateReportBody,
  updateReportConfig,
  updateReportFigures,
  updateReportImages,
  updateReportLabel,
} from "../../db/mod.ts";
import { applyReportToLiveRoom } from "../../collab/report_rooms.ts";
import {
  editorFromGlobalUser,
  recordVersionEdit,
} from "../../collab/version_capture.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { notifyProjectReportsUpdated } from "../../task_management/notify_project_v2.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesReports = new Hono();

defineRoute(
  routesReports,
  "getAllReports",
  requireProjectPermission("can_view_reports"),
  async (c) => {
    const res = await getAllReports(c.var.ppk.projectDb);
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "getReportDetail",
  requireProjectPermission("can_view_reports"),
  async (c, { params }) => {
    const res = await getReportDetail(c.var.ppk.projectDb, params.report_id);
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "createReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { body }) => {
    const res = await createReport(
      c.var.ppk.projectDb,
      body.label,
      body.folderId,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [res.data.reportId],
      res.data.lastUpdated,
    );

    const reportsRes = await getAllReports(c.var.ppk.projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportLabel",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await updateReportLabel(
      c.var.ppk.projectDb,
      params.report_id,
      body.label,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(
      c.var.ppk.projectId,
      "report",
      params.report_id,
      editorFromGlobalUser(c.var.globalUser),
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    const reportsRes = await getAllReports(c.var.ppk.projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportBody",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    // While a collab room is live for this report, the room's doc is
    // authoritative: a direct DB write would be silently overwritten by the
    // room's next checkpoint. Route the save through the room instead — the
    // change merges into the shared doc (relayed live to connected editors)
    // and the room checkpoints it immediately (which fires its own SSE
    // notifications). Merging into the live doc IS the conflict resolution,
    // so the room path reports conflicted: false.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomLastUpdated = await applyReportToLiveRoom(
      c.var.ppk.projectId,
      params.report_id,
      { body: body.body },
      editor,
    );
    if (roomLastUpdated !== null) {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomLastUpdated, conflicted: false },
      });
    }

    const res = await updateReportBody(
      c.var.ppk.projectDb,
      params.report_id,
      body.body,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(c.var.ppk.projectId, "report", params.report_id, editor);

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    // Re-broadcast the summary list so the list-card preview (derived from the
    // body) stays fresh.
    const reportsRes = await getAllReports(c.var.ppk.projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportFigures",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    // Live-room chokepoint — see updateReportBody.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomLastUpdated = await applyReportToLiveRoom(
      c.var.ppk.projectId,
      params.report_id,
      { figures: body.figures as any },
      editor,
    );
    if (roomLastUpdated !== null) {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomLastUpdated },
      });
    }

    const res = await updateReportFigures(
      c.var.ppk.projectDb,
      params.report_id,
      body.figures as any,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(c.var.ppk.projectId, "report", params.report_id, editor);

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportImages",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    // Live-room chokepoint — see updateReportBody.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomLastUpdated = await applyReportToLiveRoom(
      c.var.ppk.projectId,
      params.report_id,
      { images: body.images },
      editor,
    );
    if (roomLastUpdated !== null) {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomLastUpdated },
      });
    }

    const res = await updateReportImages(
      c.var.ppk.projectDb,
      params.report_id,
      body.images,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(c.var.ppk.projectId, "report", params.report_id, editor);

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportConfig",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await updateReportConfig(
      c.var.ppk.projectDb,
      params.report_id,
      body.config,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    const reportsRes = await getAllReports(c.var.ppk.projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "moveReportToFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await moveReportToFolder(
      c.var.ppk.projectDb,
      params.report_id,
      body.folderId,
    );
    if (res.success) {
      const reportsRes = await getAllReports(c.var.ppk.projectDb);
      if (reportsRes.success) {
        notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "duplicateReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await duplicateReport(
      c.var.ppk.projectDb,
      params.report_id,
      body.label,
      body.folderId,
    );
    if (res.success) {
      const reportsRes = await getAllReports(c.var.ppk.projectDb);
      if (reportsRes.success) {
        notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "deleteReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params }) => {
    const res = await deleteReport(c.var.ppk.projectDb, params.report_id);
    if (res.success) {
      const reportsRes = await getAllReports(c.var.ppk.projectDb);
      if (reportsRes.success) {
        notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
      }
    }
    return c.json(res);
  },
);
