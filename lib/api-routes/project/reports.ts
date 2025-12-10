import { route } from "../route-utils.ts";
import {
  ReportType,
  ReportConfig,
  ReportDetail,
  ReportItem,
  ReportItemConfig,
} from "../../types/mod.ts";

export const reportRouteRegistry = {
  createReport: route({
    path: "/reports",
    method: "POST",
    body: {} as {
      label: string;
      reportType: ReportType;
    },
    response: {} as {
      newReportId: string;
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  duplicateReport: route({
    path: "/duplicate_report/:report_id",
    method: "POST",
    params: {} as { report_id: string },
    body: {} as {
      label: string;
      newProjectId: string | "this_project";
    },
    response: {} as {
      newReportId: string;
      newReportItemIds: string[];
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  getReportDetail: route({
    path: "/reports/:report_id",
    method: "GET",
    params: {} as { report_id: string },
    response: {} as ReportDetail,
    requiresProject: true,
  }),

  updateReportConfig: route({
    path: "/report_config/:report_id",
    method: "POST",
    params: {} as { report_id: string },
    body: {} as {
      config: ReportConfig;
    },
    response: {} as {
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  backupReport: route({
    path: "/backup_report/:report_id",
    method: "GET",
    params: {} as { report_id: string },
    response: {} as {
      report: ReportDetail;
      reportItems: ReportItem[];
    },
    requiresProject: true,
  }),

  restoreReport: route({
    path: "/restore_report",
    method: "POST",
    body: {} as {
      report: ReportDetail;
      reportItems: ReportItem[];
    },
    response: {} as {
      newReportId: string;
      newReportItemIds: string[];
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  deleteReport: route({
    path: "/reports/:report_id",
    method: "DELETE",
    params: {} as { report_id: string },
    requiresProject: true,
  }),

  updateLongFormContent: route({
    path: "/long_form_content/:report_id",
    method: "POST",
    params: {} as { report_id: string },
    body: {} as { markdown: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  createReportItem: route({
    path: "/report_items/:report_id",
    method: "POST",
    params: {} as { report_id: string },
    response: {} as {
      newReportItemId: string;
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  duplicateReportItem: route({
    path: "/duplicate_report_item/:report_id/:item_id",
    method: "POST",
    params: {} as { report_id: string; item_id: string },
    body: {} as {
      nextOrEnd: "next" | "end";
      newReportId: string | "this_report";
    },
    response: {} as {
      newReportItemId: string;
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  getReportItem: route({
    path: "/report_items/:report_id/:item_id",
    method: "GET",
    params: {} as { report_id: string; item_id: string },
    response: {} as ReportItem,
    requiresProject: true,
  }),

  updateReportItemConfig: route({
    path: "/report_items/:report_id/:item_id",
    method: "POST",
    params: {} as { report_id: string; item_id: string },
    body: {} as { config: ReportItemConfig },
    response: {} as {
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  moveAndDeleteAllReportItems: route({
    path: "/move_all_report_items/:report_id",
    method: "POST",
    params: {} as { report_id: string },
    body: {} as {
      itemIdsInOrder: string[];
    },
    response: {} as {
      lastUpdated: string;
    },
    requiresProject: true,
  }),

  deleteReportItem: route({
    path: "/report_items/:report_id/:item_id",
    method: "DELETE",
    params: {} as { report_id: string; item_id: string },
    response: {} as {
      lastUpdated: string;
    },
    requiresProject: true,
  }),
} as const;

export type ReportRouteRegistry = typeof reportRouteRegistry;
