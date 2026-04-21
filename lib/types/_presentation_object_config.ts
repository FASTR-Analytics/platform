import { z } from "zod";
import { cfStorageSchema } from "./conditional_formatting.ts";
import { configDStrict } from "./_metric_installed.ts";

// ============================================================================
// PresentationObjectConfig — stored shape of a visualization config.
//
// POs are user-created via the UI (no install flow), so this file has no
// _github / _installed split.
//
// Imports from _module_definition_installed.ts (configDStrict + the period
// filter atoms transitively): one-way edge. PO config is downstream of
// module def in the data model.
//
// Reads and writes both use presentationObjectConfigSchema directly (strict
// throw on invalid). No permissive fallback — drift is caught at deploy
// time by the startup sweep (see server/db_startup_validation.ts) and at
// runtime by Zod, which returns a structured error via the route-level
// tryCatchDatabaseAsync handler.
// ============================================================================

export const customSeriesStyleSchema = z.object({
  color: z.string(),
  strokeWidth: z.number(),
  lineStyle: z.enum(["solid", "dashed"]),
});
export type CustomSeriesStyle = z.infer<typeof customSeriesStyleSchema>;

// PO config's `s` schema: all fields required (no .partial()). CF is merged
// in as flat cf* fields from cfStorageSchema (no nested
// `conditionalFormatting` field).
const presentationObjectConfigSStrict = z
  .object({
    scale: z.number(),
    content: z.enum(["lines", "bars", "points", "areas"]),
    allowIndividualRowLimits: z.boolean(),
    colorScale: z.enum([
      "pastel-discrete",
      "alt-discrete",
      "red-green",
      "blue-green",
      "single-grey",
      "custom",
    ]),
    decimalPlaces: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
    ]),
    hideLegend: z.boolean(),
    showDataLabels: z.boolean(),
    showDataLabelsLineCharts: z.boolean(),
    barsStacked: z.boolean(),
    diffInverted: z.boolean(),
    specialBarChart: z.boolean(),
    specialBarChartInverted: z.boolean(),
    specialBarChartDiffThreshold: z.number(),
    specialBarChartDataLabels: z.enum(["all-values", "threshold-values"]),
    specialCoverageChart: z.boolean(),
    specialDisruptionsChart: z.boolean(),
    specialScorecardTable: z.boolean(),
    verticalTickLabels: z.boolean(),
    horizontal: z.boolean().optional(),
    allowVerticalColHeaders: z.boolean(),
    forceYMax1: z.boolean(),
    forceYMinAuto: z.boolean(),
    customSeriesStyles: z.array(customSeriesStyleSchema),
    nColsInCellDisplay: z.union([z.literal("auto"), z.number()]),
    seriesColorFuncPropToUse: z
      .enum(["series", "cell", "col", "row"])
      .optional(),
    sortIndicatorValues: z.enum(["ascending", "descending", "none"]),
    formatAdminArea3Labels: z.boolean().optional(),
    mapProjection: z.enum(["equirectangular", "mercator", "naturalEarth1"]),
    mapShowRegionLabels: z.boolean().optional(),
  })
  .merge(cfStorageSchema);

const presentationObjectConfigTStrict = z.object({
  caption: z.string(),
  captionRelFontSize: z.number(),
  subCaption: z.string(),
  subCaptionRelFontSize: z.number(),
  footnote: z.string(),
  footnoteRelFontSize: z.number(),
});

// ── Public schema ───────────────────────────────────────────────────

export const presentationObjectConfigSchema = z.object({
  d: configDStrict,
  s: presentationObjectConfigSStrict,
  t: presentationObjectConfigTStrict,
});

export type PresentationObjectConfig = z.infer<
  typeof presentationObjectConfigSchema
>;

// ── Convenience helper for DB read call sites ───────────────────────
// Strict: throws on invalid. Route-level tryCatchDatabaseAsync turns the
// throw into a structured API error; UI shows "failed to load this
// visualization" scoped to the one viz.

export function parsePresentationObjectConfig(
  raw: string,
): PresentationObjectConfig {
  return presentationObjectConfigSchema.parse(JSON.parse(raw));
}
