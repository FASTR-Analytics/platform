import { z } from "zod";
import {
  REPORT_FORMATS,
  REPORT_HTML_STYLES,
  reportConfigSchema,
  reportFiguresSchema,
  reportImagesSchema,
  reportStyleBodySchema,
} from "../../types/mod.ts";
import type { ReportCustomStyle } from "../../types/report_styles.ts";
import type {
  ReportConfig,
  ReportDetail,
  ReportSummary,
} from "../../types/reports.ts";
import type {
  ReportVersionDetail,
  ReportVersionLineageStep,
  ReportVersionSummary,
} from "../../types/versions.ts";
import type { FigureBlock } from "../../types/_figure_bundle.ts";
import type { ImageBlock } from "../../types/slides.ts";
import { route } from "../route-utils.ts";

// report_id is a 3-char nanoid (generateUniqueReportId), not a UUID
const reportIdParamsSchema = z.object({ report_id: z.string() });
const reportVersionParamsSchema = z.object({
  report_id: z.string(),
  version_id: z.uuid(),
});
const folderBodyFields = {
  label: z.string(),
  folderId: z.uuid().nullable().optional(),
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
    // format is fixed at creation; absent ⇒ markdown.
    body: z.object({
      ...folderBodyFields,
      format: z.enum(REPORT_FORMATS).optional(),
      htmlStyle: z.enum(REPORT_HTML_STYLES).optional(),
      // A custom style from the library (main DB); the server resolves and
      // snapshots it — wins over htmlStyle.
      customStyleId: z.string().optional(),
    }),
    response: {} as { reportId: string; lastUpdated: string },
    requiresProject: true,
  }),

  // ── Custom report styles (library rows live in the MAIN db; visibility is
  // per style: this/selected projects or instance-wide) ──────────────────────

  listReportStyles: route({
    path: "/report_styles",
    method: "GET",
    response: {} as ReportCustomStyle[],
    requiresProject: true,
  }),

  createReportStyle: route({
    path: "/report_styles",
    method: "POST",
    body: reportStyleBodySchema,
    response: {} as ReportCustomStyle,
    requiresProject: true,
  }),

  updateReportStyle: route({
    path: "/report_styles/:style_id",
    method: "PUT",
    params: z.object({ style_id: z.string() }),
    body: reportStyleBodySchema,
    response: {} as ReportCustomStyle,
    requiresProject: true,
  }),

  deleteReportStyle: route({
    path: "/report_styles/:style_id",
    method: "DELETE",
    params: z.object({ style_id: z.string() }),
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

  updateReportFigures: route({
    path: "/reports/:report_id/figures",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ figures: reportFiguresSchema }),
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
    body: z.object({ folderId: z.uuid().nullable() }),
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

  listReportVersions: route({
    path: "/reports/:report_id/versions",
    method: "GET",
    params: reportIdParamsSchema,
    response: {} as ReportVersionSummary[],
    requiresProject: true,
  }),

  getReportVersion: route({
    path: "/reports/:report_id/versions/:version_id",
    method: "GET",
    params: reportVersionParamsSchema,
    response: {} as ReportVersionDetail,
    requiresProject: true,
  }),

  getReportVersionLineage: route({
    path: "/reports/:report_id/versions/:version_id/lineage",
    method: "GET",
    params: reportVersionParamsSchema,
    response: {} as ReportVersionLineageStep[],
    requiresProject: true,
  }),

  restoreReportVersion: route({
    path: "/reports/:report_id/versions/:version_id/restore",
    method: "POST",
    params: reportVersionParamsSchema,
    response: {} as { lastUpdated: string },
    requiresProject: true,
  }),

  copyReportVersion: route({
    path: "/reports/:report_id/versions/:version_id/copy",
    method: "POST",
    params: reportVersionParamsSchema,
    body: z.object(folderBodyFields),
    response: {} as { newReportId: string; lastUpdated: string },
    requiresProject: true,
  }),
} as const;
