// =============================================================================
// FigureBundle — the captured, self-contained figure artifact
// =============================================================================
//
// A FigureBundle freezes everything `buildFigureInputs` needs: config, queried
// items, resultsValue projection, metadata, localization, and provenance. After
// P2 cutover, slides/dashboards/reports store this instead of FigureInputs.
//
// Phase 1: schema defined here; stored schemas unchanged (still FigureInputs).
// Phase 2: stored schemas swap to the strict FigureBlock below; backfill runs.
//
// =============================================================================

import { z } from "zod";
import { presentationObjectConfigSchema } from "./_presentation_object_config.ts";

// ── Sub-schemas (matching existing lib types exactly) ────────────────────────

export const periodBoundsSchema = z.object({
  min: z.number(),
  max: z.number(),
});

export const indicatorMetadataSchema = z.object({
  id: z.string(),
  label: z.string(),
  format_as: z.enum(["percent", "number", "rate_per_10k"]).optional(),
  threshold_direction: z.enum(["higher_is_better", "lower_is_better"]).optional(),
  threshold_green: z.number().optional(),
  threshold_yellow: z.number().optional(),
  group_label: z.string().optional(),
  sort_order: z.number().optional(),
});

export const resultsValueForVisualizationSchema = z.object({
  formatAs: z.enum(["percent", "number"]),
  valueProps: z.array(z.string()),
  valueLabelReplacements: z.record(z.string(), z.string()).optional(),
});

// Discriminated union: live editor passes level (derives GeoJSON from sync
// cache); stored bundles (dashboards/slides/reports) embed the full GeoJSON.
export const geoRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level"), level: z.number() }),
  z.object({ kind: z.literal("data"), data: z.unknown() }),
]);

// ── Localization (extracted so callers can type function params) ─────────────

export const figureLocalizationSchema = z.strictObject({
  language: z.enum(["en", "fr"]),
  calendar: z.enum(["gregorian", "ethiopian"]),
  countryIso3: z.string().optional(),
});

export type FigureLocalization = z.infer<typeof figureLocalizationSchema>;

// ── Bundle schema ────────────────────────────────────────────────────────────

export const figureBundleSchema = z.strictObject({
  config: presentationObjectConfigSchema,
  items: z.array(z.record(z.string(), z.string())),
  resultsValue: resultsValueForVisualizationSchema,
  indicatorMetadata: z.array(indicatorMetadataSchema),
  dateRange: periodBoundsSchema.optional(),
  geo: geoRefSchema.optional(),
  localization: figureLocalizationSchema,
  metricId: z.string(),
  snapshotAt: z.string(),
  provenance: z.strictObject({
    moduleLastRun: z.string(),
    datasetsVersion: z.string(),
  }),
});

export type FigureBundle = z.infer<typeof figureBundleSchema>;

// ── Strict FigureBlock (for P2 cutover — not yet wired into stored schemas) ──

export const figureBundleBlockSchema = z.strictObject({
  type: z.literal("figure"),
  bundle: figureBundleSchema.optional(),
});

export type FigureBundleBlock = z.infer<typeof figureBundleBlockSchema>;
