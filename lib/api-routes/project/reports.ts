import { route } from "../route-utils.ts";
import type {
  ReportConfig,
  ReportDetail,
  ReportSummary,
} from "../../types/reports.ts";
import type { FigureBlock, ImageBlock } from "../../types/slides.ts";

export const reportRouteRegistry = {
  getAllReports: route({
    path: "/reports",
    method: "GET",
    response: {} as ReportSummary[],
    requiresProject: true,
  }),

  getReportDetail: route({
    path: "/reports/:report_id",
    method: "GET",
    params: {} as { report_id: string },
    response: {} as ReportDetail,
    requiresProject: true,
  }),

  createReport: route({
    path: "/reports",
    method: "POST",
    body: {} as { label: string; folderId?: string | null },
    response: {} as { reportId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateReportLabel: route({
    path: "/reports/:report_id/label",
    method: "PUT",
    params: {} as { report_id: string },
    body: {} as { label: string },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updateReportBody: route({
    path: "/reports/:report_id/body",
    method: "PUT",
    params: {} as { report_id: string },
    body: {} as {
      body: string;
      expectedLastUpdated?: string;
      overwrite?: boolean;
    },
    response: {} as { lastUpdated: string; conflicted: boolean },
    requiresProject: true,
  }),

  updateReportFigures: route({
    path: "/reports/:report_id/figures",
    method: "PUT",
    params: {} as { report_id: string },
    body: {} as { figures: Record<string, FigureBlock> },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updateReportImages: route({
    path: "/reports/:report_id/images",
    method: "PUT",
    params: {} as { report_id: string },
    body: {} as { images: Record<string, ImageBlock> },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updateReportConfig: route({
    path: "/reports/:report_id/config",
    method: "PUT",
    params: {} as { report_id: string },
    body: {} as { config: ReportConfig },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  moveReportToFolder: route({
    path: "/reports/:report_id/folder",
    method: "PUT",
    params: {} as { report_id: string },
    body: {} as { folderId: string | null },
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  duplicateReport: route({
    path: "/reports/:report_id/duplicate",
    method: "POST",
    params: {} as { report_id: string },
    body: {} as { label: string; folderId?: string | null },
    response: {} as { newReportId: string; lastUpdated: string },
    requiresProject: true,
  }),

  deleteReport: route({
    path: "/reports/:report_id",
    method: "DELETE",
    params: {} as { report_id: string },
    response: {} as never,
    requiresProject: true,
  }),
};
