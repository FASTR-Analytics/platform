import { z } from "zod";
import { cfStorageSchema } from "./conditional_formatting.ts";
import { configDStrict, disaggregationOption } from "./_metric_installed.ts";
import { ROLLUP_PIN_IDS } from "../rollup.ts";

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
    content: z.enum([
      "bars",
      "lines",
      "points",
      "lines-area",
      "lines-points",
      "points-connectors",
    ]),
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
    // Optional, read as `?? false`. Optional is load-bearing: stored slide and
    // report figures embed a copy of this config, and nothing
    // backfills a post-P2 bundle — a required field would fail the boot sweep's
    // parse. Historical figures carry no __n_* items either, so they render the
    // same as a backfilled false.
    showNValues: z.boolean().optional(),
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
    mapDataLabelMode: z
      .enum(["none", "centroid", "callout", "auto"])
      .optional(),
    // Optional for the same reason as showNValues above. Read as `?? 0`.
    pieInnerRadiusRatio: z.number().optional(),
    // Global-share threshold as a fraction (0-1); 0/absent = off.
    pieGroupSmallSlices: z.number().optional(),
    // Draw each pie against a fixed 100% envelope instead of its own slice
    // sum, so the filled arc reads as the value itself. Percent metrics only
    // — see isPieCompletionMode, which is the gate both the data config and
    // the style must consult.
    pieCompletionMode: z.boolean().optional(),
    // Print the value in the doughnut hole (panther `centerLabel`): the share
    // against the fixed envelope in completion mode, the summed value
    // otherwise. A no-op on a pie with no hole.
    pieShowCenterValue: z.boolean().optional(),
    // Optional for the same reason as showNValues above. User-defined display
    // order for a dimension's values, applied to whichever axis the disOpt
    // occupies at render (style layer — never in the fetch config or cache
    // hash). Ids absent from the list sink to the end alphabetically.
    // Roll-up sentinels are rejected: panther's byIdOrder rank map is
    // last-wins on duplicates, so a sentinel inside orderedIds would defeat
    // the pin fold in getCustomOrderSort. The editor can't produce one
    // (sentinels are query-synthesized, never in possible values); this
    // guards hand-written and future AI-written configs.
    customValueOrder: z
      .array(
        z.object({
          disOpt: disaggregationOption,
          orderedIds: z.array(
            z
              .string()
              .refine((id) => !ROLLUP_PIN_IDS.includes(id), {
                message: "Roll-up sentinel ids are not orderable",
              }),
          ),
        }),
      )
      .optional(),
  })
  .merge(cfStorageSchema);

export const presentationObjectConfigTStrict = z.object({
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
