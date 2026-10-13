import { z } from "zod";
import {
  FASTR_REPORT_THEMES,
  reportConfigSchema,
  reportFiguresSchema,
  reportImagesSchema,
  reportStyleBodySchema,
} from "../../types/mod.ts";
import type { ReportConfig, ReportDetail } from "../../types/reports.ts";
import type { ReportCustomStyle } from "../../types/report_styles.ts";
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

const productStyleParamsSchema = z.object({
  product_id: z.string(),
  style_id: z.string(),
});

// Report content and version routes only (see ./slide-decks.ts).
export const productReportRouteRegistry = {
  getReportDetail: route({
    path: "/products/:product_id/report",
    method: "GET",
    params: productIdParamsSchema,
    response: {} as ReportDetail,
    access: "view",
  }),

  updateReportBody: route({
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

  updateReportFigures: route({
    path: "/products/:product_id/report/figures",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ figures: reportFiguresSchema }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  updateReportImages: route({
    path: "/products/:product_id/report/images",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ images: reportImagesSchema }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  updateReportConfig: route({
    path: "/products/:product_id/report/config",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({ config: reportConfigSchema }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  // The paged PDF of a FASTR Markdown report. The CLIENT builds the complete
  // standalone document (rasters, inlined fonts, the paged sheet and the
  // Paged.js runner) exactly as its editor lays it out; the server only
  // prints it with headless Chrome, so the PDF and the editor's page boxes
  // agree. Streaming: a render takes seconds and the payload carries every
  // raster.
  renderReportPdf: route({
    path: "/products/:product_id/report/pdf",
    method: "POST",
    params: productIdParamsSchema,
    body: z.object({ html: z.string().max(80_000_000) }),
    response: {} as { pdfBase64: string; pages: number },
    access: "view",
    isStreaming: true,
  }),

  // A FASTR Markdown report's look, changed after creation. Unlike an html
  // report's style (fixed at creation because the body IS the design), a
  // fastr body carries no CSS, so re-theming can never invalidate it. The
  // custom style is named by ID and resolved server-side: the visibility
  // check and the snapshot are not the client's to assert.
  setReportStyle: route({
    path: "/products/:product_id/report/style",
    method: "PUT",
    params: productIdParamsSchema,
    body: z.object({
      fastrTheme: z.enum(FASTR_REPORT_THEMES),
      // null clears a custom style back to the theme's own palette.
      customStyleId: z.string().nullable(),
    }),
    // Returns the STORED config, not just the stamp: the style snapshot is
    // resolved server-side, so this is the only way the editor learns the
    // palette it must repaint with. Re-reading the report instead would race
    // the products SSE that invalidates the detail cache.
    response: {} as { lastUpdated: string; config: ReportConfig },
    access: "edit",
  }),

  // Custom report styles. The library rows are instance-level (main DB), but
  // every route is product-scoped because visibility is per product: a style
  // is offered to every report or only to the ones it names. Authoring a
  // style is an "edit" on the report it is being authored from.
  listReportStyles: route({
    path: "/products/:product_id/report/styles",
    method: "GET",
    params: productIdParamsSchema,
    response: {} as ReportCustomStyle[],
    access: "view",
  }),

  createReportStyle: route({
    path: "/products/:product_id/report/styles",
    method: "POST",
    params: productIdParamsSchema,
    body: reportStyleBodySchema,
    response: {} as ReportCustomStyle,
    access: "edit",
  }),

  updateReportStyle: route({
    path: "/products/:product_id/report/styles/:style_id",
    method: "PUT",
    params: productStyleParamsSchema,
    body: reportStyleBodySchema,
    response: {} as ReportCustomStyle,
    access: "edit",
  }),

  deleteReportStyle: route({
    path: "/products/:product_id/report/styles/:style_id",
    method: "DELETE",
    params: productStyleParamsSchema,
    access: "edit",
  }),

  listReportVersions: route({
    path: "/products/:product_id/report/versions",
    method: "GET",
    params: productIdParamsSchema,
    response: {} as ReportVersionSummary[],
    access: "view",
  }),

  getReportVersion: route({
    path: "/products/:product_id/report/versions/:version_id",
    method: "GET",
    params: productVersionParamsSchema,
    response: {} as ReportVersionDetail,
    access: "view",
  }),

  getReportVersionLineage: route({
    path: "/products/:product_id/report/versions/:version_id/lineage",
    method: "GET",
    params: productVersionParamsSchema,
    response: {} as ReportVersionLineageStep[],
    access: "view",
  }),

  restoreReportVersion: route({
    path: "/products/:product_id/report/versions/:version_id/restore",
    method: "POST",
    params: productVersionParamsSchema,
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  copyReportVersion: route({
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
