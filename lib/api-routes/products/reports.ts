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
import { type ProductAccessLevel, route } from "../route-utils.ts";
import { productIdParamsSchema } from "./products.ts";

const productVersionParamsSchema = z.object({
  product_id: z.string(),
  version_id: z.uuid(),
});

// Report content and version routes only (see ./slide-decks.ts). Keys carry
// a `Product` infix until 9b.
export const productReportRouteRegistry = {
  getProductReportDetail: route({
    path: "/products/:product_id/report",
    method: "GET",
    params: productIdParamsSchema,
    response: {} as ReportDetail,
    access: "view",
  }),

  updateProductReportBody: route({
    path: "/products/:product_id/report/body",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({
      body: z.string(),
      expectedLastUpdated: z.string().optional(),
      overwrite: z.boolean().optional(),
    }),
    response: {} as { lastUpdated: string; conflicted: boolean },
    access: "edit",
  }),

  updateProductReportFigures: route({
    path: "/products/:product_id/report/figures",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ figures: reportFiguresSchema }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  updateProductReportImages: route({
    path: "/products/:product_id/report/images",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ images: reportImagesSchema }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  updateProductReportConfig: route({
    path: "/products/:product_id/report/config",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ config: reportConfigSchema }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  listProductReportVersions: route({
    path: "/products/:product_id/report/versions",
    method: "GET",
    params: productIdParamsSchema,
    response: {} as ReportVersionSummary[],
    access: "view",
  }),

  getProductReportVersion: route({
    path: "/products/:product_id/report/versions/:version_id",
    method: "GET",
    params: productVersionParamsSchema,
    response: {} as ReportVersionDetail,
    access: "view",
  }),

  getProductReportVersionLineage: route({
    path: "/products/:product_id/report/versions/:version_id/lineage",
    method: "GET",
    params: productVersionParamsSchema,
    response: {} as ReportVersionLineageStep[],
    access: "view",
  }),

  restoreProductReportVersion: route({
    path: "/products/:product_id/report/versions/:version_id/restore",
    method: "POST",
    params: productVersionParamsSchema,
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  copyProductReportVersion: route({
    path: "/products/:product_id/report/versions/:version_id/copy",
    method: "POST",
    params: productVersionParamsSchema,
    body: z.object({
      label: z.string(),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { productId: string; lastUpdated: string },
    access: "edit",
  }),
} as const satisfies Record<string, { access: ProductAccessLevel }>;
