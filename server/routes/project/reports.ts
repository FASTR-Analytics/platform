import { Hono } from "hono";
import {
  addReport,
  addReportItem,
  backupReport,
  deleteReport,
  deleteReportItem,
  duplicateReport,
  duplicateReportItem,
  getReportDetail,
  getReportItem,
  moveAndDeleteAllReportItems,
  restoreReport,
  // updateLongFormContent,
  updateReportConfig,
  updateReportItemConfig,
} from "../../db/mod.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";

export const routesReports = new Hono();

defineRoute(
  routesReports,
  "createReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  log("createReport"),
  async (c, { body }) => {
    const res = await addReport(
      c.var.ppk.projectDb,
      body.label,
      body.reportType,
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [res.data.newReportId],
      res.data.lastUpdated,
    );
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
  log("duplicateReport"),
  async (c, { params, body }) => {
    const res = await duplicateReport(
      c.var.ppk.projectDb,
      params.report_id,
      body.label,
      body.newProjectId,
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [res.data.newReportId],
      res.data.lastUpdated,
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      res.data.newReportItemIds,
      res.data.lastUpdated,
    );
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "getReportDetail",
  requireProjectPermission("can_view_reports"),
  log("getReportDetail"),
  async (c, { params }) => {
    const res = await getReportDetail(
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
      params.report_id,
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
  log("updateReportConfig"),
  async (c, { params, body }) => {
    const res = await updateReportConfig(
      c.var.ppk.projectDb,
      params.report_id,
      body.config,
    );
    if (res.success === false) {
      return c.json(res);
    }
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
  "backupReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: false },
    "can_configure_reports",
  ),
  log("backupReport"),
  async (c, { params }) => {
    const res = await backupReport(
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
      params.report_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "restoreReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  log("restoreReport"),
  async (c, { body }) => {
    const res = await restoreReport(
      c.var.ppk.projectDb,
      body.report,
      body.reportItems,
    );
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
  log("deleteReport"),
  async (c, { params }) => {
    const res = await deleteReport(c.var.ppk.projectDb, params.report_id);
    return c.json(res);
  },
);

////////////////////////
//                    //
//    Report items    //
//                    //
////////////////////////

defineRoute(
  routesReports,
  "createReportItem",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  log("createReportItem"),
  async (c, { params, body }) => {
    const res = await addReportItem(
      c.var.ppk.projectDb,
      params.report_id,
      body.afterItemId,
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      [res.data.newReportItemId],
      res.data.lastUpdated,
    );
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
  "duplicateReportItem",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  log("duplicateReportItem"),
  async (c, { params, body }) => {
    const res = await duplicateReportItem(
      c.var.ppk.projectDb,
      params.report_id,
      params.item_id,
      body.nextOrEnd,
      body.newReportId,
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      [res.data.newReportItemId],
      res.data.lastUpdated,
    );
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
  "getReportItem",
  requireProjectPermission("can_view_reports"),
  log("getReportItem"),
  async (c, { params }) => {
    const res = await getReportItem(
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
      params.item_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportItemConfig",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  log("updateReportItemConfig"),
  async (c, { params, body }) => {
    const res = await updateReportItemConfig(
      c.var.ppk.projectDb,
      params.item_id,
      body.config,
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      [params.item_id],
      res.data.lastUpdated,
    );
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "moveAndDeleteAllReportItems",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  log("moveAndDeleteAllReportItems"),
  async (c, { params, body }) => {
    const res = await moveAndDeleteAllReportItems(
      c.var.ppk.projectDb,
      params.report_id,
      body.itemIdsInOrder,
    );
    if (res.success === false) {
      return c.json(res);
    }
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
  "deleteReportItem",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  log("deleteReportItem"),
  async (c, { params }) => {
    const res = await deleteReportItem(c.var.ppk.projectDb, params.item_id);
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );
    return c.json(res);
  },
);
