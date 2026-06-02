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

export const dashboardLayoutSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sidebar") }),
  z.object({ type: z.literal("grid") }),
]);

export type DashboardLayoutFromSchema = z.infer<typeof dashboardLayoutSchema>;

// ── Dashboard config — STORED SHAPE (dashboards.config column) ───────────────
// Logos mirror the slide-deck pattern: identifiers are FASTR built-in logo
// values or uploaded image asset filenames; URLs are resolved at render time.

const dashboardLogosConfigSchema = z.object({
  availableCustom: z.array(z.string()),
  selected: z.array(z.string()),
  size: z.enum(["sm", "md", "lg", "xl"]).optional(),
});

const dashboardAboutConfigSchema = z.object({
  summary: z.string(), // inline markdown under the heading ("" = hidden)
  body: z.string(), // long markdown for the About modal ("" = button hidden)
});

export const dashboardConfigSchema = z.object({
  logos: dashboardLogosConfigSchema,
  about: dashboardAboutConfigSchema,
});

export type DashboardConfigFromSchema = z.infer<typeof dashboardConfigSchema>;
