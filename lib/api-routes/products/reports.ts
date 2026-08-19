import { z } from "zod";
import {
  reportConfigSchema,
  reportFiguresSchema,
  reportImagesSchema,
} from "../../types/mod.ts";
import type { ReportDetail } from "../../types/reports.ts";
import type {
  ReportVersionDetail,
  ReportVersionLineageStep,
  ReportVersionSummary,
} from "../../types/versions.ts";
import { route } from "../route-utils.ts";

// report_id IS the product id.
const reportIdParamsSchema = z.object({ report_id: z.string() });
const reportVersionParamsSchema = z.object({
  report_id: z.string(),
  version_id: z.uuid(),
});

// Content and version routes only — see ./slide-decks.ts for why.
export const reportRouteRegistry = {
  getReportDetail: route({
    path: "/reports/:report_id",
    method: "GET",
    params: reportIdParamsSchema,
    response: {} as ReportDetail,
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
  }),

  updateReportFigures: route({
    path: "/reports/:report_id/figures",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ figures: reportFiguresSchema }),
    response: {} as { lastUpdated: string },
  }),

  updateReportImages: route({
    path: "/reports/:report_id/images",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ images: reportImagesSchema }),
    response: {} as { lastUpdated: string },
  }),

  updateReportConfig: route({
    path: "/reports/:report_id/config",
    method: "PUT",
    params: reportIdParamsSchema,
    body: z.object({ config: reportConfigSchema }),
    response: {} as { lastUpdated: string },
  }),

  listReportVersions: route({
    path: "/reports/:report_id/versions",
    method: "GET",
    params: reportIdParamsSchema,
    response: {} as ReportVersionSummary[],
  }),

  getReportVersion: route({
    path: "/reports/:report_id/versions/:version_id",
    method: "GET",
    params: reportVersionParamsSchema,
    response: {} as ReportVersionDetail,
  }),

  getReportVersionLineage: route({
    path: "/reports/:report_id/versions/:version_id/lineage",
    method: "GET",
    params: reportVersionParamsSchema,
    response: {} as ReportVersionLineageStep[],
  }),

  restoreReportVersion: route({
    path: "/reports/:report_id/versions/:version_id/restore",
    method: "POST",
    params: reportVersionParamsSchema,
    response: {} as { lastUpdated: string },
  }),

  copyReportVersion: route({
    path: "/reports/:report_id/versions/:version_id/copy",
    method: "POST",
    params: reportVersionParamsSchema,
    body: z.object({
      label: z.string(),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { productId: string; lastUpdated: string },
  }),
} as const;
