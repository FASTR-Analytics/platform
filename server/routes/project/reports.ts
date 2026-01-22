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
  updateReportConfig,
  updateReportItemConfig,
} from "../../db/mod.ts";
import { getProjectEditor, getProjectViewer } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";

export const routesReports = new Hono();

defineRoute(
  routesReports,
  "createReport",
  getProjectEditor,
  log("createReport"),
  async (c, { body }) => {
    const res = await addReport(
      c.var.ppk.projectDb,
      body.label,
      body.reportType
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [res.data.newReportId],
      res.data.lastUpdated
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "duplicateReport",
  getProjectViewer,
  log("duplicateReport"),
  async (c, { params, body }) => {
    const res = await duplicateReport(
      c.var.ppk.projectDb,
      params.report_id,
      body.label,
      body.newProjectId
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [res.data.newReportId],
      res.data.lastUpdated
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      res.data.newReportItemIds,
      res.data.lastUpdated
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "getReportDetail",
  getProjectViewer,
  log("getReportDetail"),
  async (c, { params }) => {
    const res = await getReportDetail(
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
      params.report_id
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "updateReportConfig",
  getProjectEditor,
  log("updateReportConfig"),
  async (c, { params, body }) => {
    const res = await updateReportConfig(
      c.var.ppk.projectDb,
      params.report_id,
      body.config
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "backupReport",
  getProjectEditor,
  log("backupReport"),
  async (c, { params }) => {
    const res = await backupReport(
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
      params.report_id
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "restoreReport",
  getProjectEditor,
  log("restoreReport"),
  async (c, { body }) => {
    const res = await restoreReport(
      c.var.ppk.projectDb,
      body.report,
      body.reportItems
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "deleteReport",
  getProjectEditor,
  log("deleteReport"),
  async (c, { params }) => {
    const res = await deleteReport(c.var.ppk.projectDb, params.report_id);
    return c.json(res);
  }
);

////////////////////////
//                    //
//    Report items    //
//                    //
////////////////////////

defineRoute(
  routesReports,
  "createReportItem",
  getProjectEditor,
  log("createReportItem"),
  async (c, { params }) => {
    const res = await addReportItem(c.var.ppk.projectDb, params.report_id);
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      [res.data.newReportItemId],
      res.data.lastUpdated
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "duplicateReportItem",
  getProjectEditor,
  log("duplicateReportItem"),
  async (c, { params, body }) => {
    const res = await duplicateReportItem(
      c.var.ppk.projectDb,
      params.report_id,
      params.item_id,
      body.nextOrEnd,
      body.newReportId
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      [res.data.newReportItemId],
      res.data.lastUpdated
    );
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "getReportItem",
  getProjectViewer,
  log("getReportItem"),
  async (c, { params }) => {
    const res = await getReportItem(
      c.var.ppk.projectId,
      c.var.ppk.projectDb,
      params.item_id
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "updateReportItemConfig",
  getProjectEditor,
  log("updateReportItemConfig"),
  async (c, { params, body }) => {
    const res = await updateReportItemConfig(
      c.var.ppk.projectDb,
      params.item_id,
      body.config
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "report_items",
      [params.item_id],
      res.data.lastUpdated
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "moveAndDeleteAllReportItems",
  getProjectEditor,
  log("moveAndDeleteAllReportItems"),
  async (c, { params, body }) => {
    const res = await moveAndDeleteAllReportItems(
      c.var.ppk.projectDb,
      params.report_id,
      body.itemIdsInOrder
    );
    if (res.success === false) {
      return c.json(res);
    }
    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated
    );
    return c.json(res);
  }
);

defineRoute(
  routesReports,
  "deleteReportItem",
  getProjectEditor,
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
      res.data.lastUpdated
    );
    return c.json(res);
  }
);
