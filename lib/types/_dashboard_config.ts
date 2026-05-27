// =============================================================================
// Dashboard Item Figure Block — STORED SHAPE (dashboard_items.figure_block column)
// Dashboard Layout — STORED SHAPE (dashboards.layout column)
// =============================================================================

import { z } from "zod";
import { presentationObjectConfigSchema } from "./_presentation_object_config.ts";

// ── Figure Source (mirrors slide figureSourceSchema) ────────────────────────

const figureSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("from_data"),
    metricId: z.string(),
    config: presentationObjectConfigSchema,
    snapshotAt: z.string(),
    indicatorMetadata: z.array(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("custom"),
    description: z.string().optional(),
  }),
]);

// ── Figure Block ────────────────────────────────────────────────────────────

export const dashboardFigureBlockSchema = z.object({
  type: z.literal("figure"),
  figureInputs: z.unknown().optional(),
  source: figureSourceSchema.optional(),
});

export type DashboardFigureBlockFromSchema = z.infer<typeof dashboardFigureBlockSchema>;

// ── Layout ──────────────────────────────────────────────────────────────────

export const dashboardLayoutSchema = z.object({
  type: z.literal("sidebar"),
  menuPosition: z.enum(["left", "right"]),
});

export type DashboardLayoutFromSchema = z.infer<typeof dashboardLayoutSchema>;
