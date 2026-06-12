import { z } from "zod";
import { reportConfigSchema, reportImagesSchema } from "../../types/mod.ts";
import type {
  ReportConfig,
  ReportDetail,
  ReportSummary,
} from "../../types/reports.ts";
import type { FigureBlock, ImageBlock } from "../../types/slides.ts";
import { route } from "../route-utils.ts";

const reportIdParamsSchema = z.object({ report_id: z.uuid() });
const folderBodyFields = {
  label: z.string(),
  folderId: z.string().uuid().nullable().optional(),
};

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
    params: reportIdParamsSchema,
    response: {} as ReportDetail,
    requiresProject: true,
  }),

  createReport: route({
    path: "/reports",
    method: "POST",
    body: z.object(folderBodyFields),
    response: {} as { reportId: string; lastUpdated: string },
    requiresProject: true,
  }),

  updateReportLabel: route({
    path: "/reports/:report_id/label",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ label: z.string() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updateReportBody: route({
    path: "/reports/:report_id/body",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({
      body: z.string(),
      expectedLastUpdated: z.string().optional(),
      overwrite: z.boolean().optional(),
    }),
    response: {} as { lastUpdated: string; conflicted: boolean },
    requiresProject: true,
  }),

  // sentinel-encoded: figures cross the wire via prepareReportFiguresForTransmit;
  // real validation happens in the DB layer after decode (plan decision 4).
  updateReportFigures: route({
    path: "/reports/:report_id/figures",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ figures: z.unknown() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updateReportImages: route({
    path: "/reports/:report_id/images",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ images: reportImagesSchema }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  updateReportConfig: route({
    path: "/reports/:report_id/config",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ config: reportConfigSchema }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  moveReportToFolder: route({
    path: "/reports/:report_id/folder",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ folderId: z.string().uuid().nullable() }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  duplicateReport: route({
    path: "/reports/:report_id/duplicate",
    method: "POST",
    params: reportIdParamsSchema,
    body: z.object(folderBodyFields),
    response: {} as { newReportId: string; lastUpdated: string },
    requiresProject: true,
  }),

  deleteReport: route({
    path: "/reports/:report_id",
    method: "DELETE",
    params: reportIdParamsSchema,
    response: {} as never,
    requiresProject: true,
  }),
} as const;
