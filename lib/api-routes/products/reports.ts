import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import {
  fastrReportThemeSchema,
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
import { route } from "../route-utils.ts";
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
    guard: GUARD.product("view"),
    params: productIdParamsSchema,
    response: {} as ReportDetail,
  }),

  updateReportBody: route({
    path: "/products/:product_id/report/body",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({
      body: z.string(),
      expectedLastUpdated: z.string().optional(),
      overwrite: z.boolean().optional(),
    }),
    response: {} as { lastUpdated: string; conflicted: boolean },
  }),

  updateReportFigures: route({
    path: "/products/:product_id/report/figures",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({ figures: reportFiguresSchema }),
    response: {} as { lastUpdated: string },
  }),

  updateReportImages: route({
    path: "/products/:product_id/report/images",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({ images: reportImagesSchema }),
    response: {} as { lastUpdated: string },
  }),

  updateReportConfig: route({
    path: "/products/:product_id/report/config",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({ config: reportConfigSchema }),
    response: {} as { lastUpdated: string },
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
    guard: GUARD.product("view"),
    params: productIdParamsSchema,
    body: z.object({ html: z.string().max(80_000_000) }),
    response: {} as { pdfBase64: string; pages: number },
    isStreaming: true,
  }),

  // A report's look, changed after creation. The body carries no CSS, so
  // re-theming can never invalidate it. The custom style is named by ID and resolved server-side: the visibility
  // check and the snapshot are not the client's to assert.
  setReportStyle: route({
    path: "/products/:product_id/report/style",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: z.object({
      fastrTheme: fastrReportThemeSchema,
      // null clears a custom style back to the theme's own palette.
      customStyleId: z.string().nullable(),
    }),
    // Returns the STORED config, not just the stamp: the style snapshot is
    // resolved server-side, so this is the only way the editor learns the
    // palette it must repaint with. Re-reading the report instead would race
    // the products SSE that invalidates the detail cache.
    response: {} as { lastUpdated: string; config: ReportConfig },
  }),

  // Custom report styles. The library rows are instance-level (main DB), but
  // every route is product-scoped because visibility is per product: a style
  // is offered to every report or only to the ones it names. Authoring a
  // style is an "edit" on the report it is being authored from.
  listReportStyles: route({
    path: "/products/:product_id/report/styles",
    method: "GET",
    guard: GUARD.product("view"),
    params: productIdParamsSchema,
    response: {} as ReportCustomStyle[],
  }),

  createReportStyle: route({
    path: "/products/:product_id/report/styles",
    method: "POST",
    guard: GUARD.product("edit"),
    params: productIdParamsSchema,
    body: reportStyleBodySchema,
    response: {} as ReportCustomStyle,
  }),

  updateReportStyle: route({
    path: "/products/:product_id/report/styles/:style_id",
    method: "PUT",
    guard: GUARD.product("edit"),
    params: productStyleParamsSchema,
    body: reportStyleBodySchema,
    response: {} as ReportCustomStyle,
  }),

  deleteReportStyle: route({
    path: "/products/:product_id/report/styles/:style_id",
    method: "DELETE",
    guard: GUARD.product("edit"),
    params: productStyleParamsSchema,
  }),

  listReportVersions: route({
    path: "/products/:product_id/report/versions",
    method: "GET",
    guard: GUARD.product("view"),
    params: productIdParamsSchema,
    response: {} as ReportVersionSummary[],
  }),

  getReportVersion: route({
    path: "/products/:product_id/report/versions/:version_id",
    method: "GET",
    guard: GUARD.product("view"),
    params: productVersionParamsSchema,
    response: {} as ReportVersionDetail,
  }),

  getReportVersionLineage: route({
    path: "/products/:product_id/report/versions/:version_id/lineage",
    method: "GET",
    guard: GUARD.product("view"),
    params: productVersionParamsSchema,
    response: {} as ReportVersionLineageStep[],
  }),

  restoreReportVersion: route({
    path: "/products/:product_id/report/versions/:version_id/restore",
    method: "POST",
    guard: GUARD.product("edit"),
    params: productVersionParamsSchema,
    response: {} as { lastUpdated: string },
  }),

  copyReportVersion: route({
    path: "/products/:product_id/report/versions/:version_id/copy",
    method: "POST",
    guard: GUARD.product("view"),
    params: productVersionParamsSchema,
    body: z.object({
      label: z.string(),
      folderId: z.uuid().nullable(),
    }),
    response: {} as { productId: string; lastUpdated: string },
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
