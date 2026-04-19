import { z } from "zod";
import { configD } from "./module_definition.ts";

// ============================================================================
// PresentationObjectConfig — the stored shape of a visualization config.
// Schema + derived type live in this file (single source of truth).
// This file sits downstream of module_definition.ts (imports configD);
// presentation_objects.ts and module_definition.ts both import the type from
// here to avoid circular value-level dependencies.
// ============================================================================

export const customSeriesStyleSchema = z.object({
  color: z.string(),
  strokeWidth: z.number(),
  lineStyle: z.enum(["solid", "dashed"]),
});
export type CustomSeriesStyle = z.infer<typeof customSeriesStyleSchema>;

const presentationObjectConfigSSchema = z.object({
  scale: z.number(),
  content: z.enum(["lines", "bars", "points", "areas"]),
  conditionalFormatting: z.string(),
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
  diffAreas: z.boolean(),
  diffAreasOrder: z.enum(["actual-expected", "expected-actual"]),
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
  mapColorPreset: z.enum(["red", "blue", "green", "red-green", "custom"]),
  mapColorReverse: z.boolean(),
  mapColorFrom: z.string(),
  mapColorTo: z.string(),
  mapProjection: z.enum(["equirectangular", "mercator", "naturalEarth1"]),
  mapScaleType: z.enum(["continuous", "discrete"]),
  mapDiscreteSteps: z.number(),
  mapDomainType: z.enum(["auto", "fixed"]),
  mapDomainMin: z.number(),
  mapDomainMax: z.number(),
  mapShowRegionLabels: z.boolean().optional(),
});

const presentationObjectConfigTSchema = z.object({
  caption: z.string(),
  captionRelFontSize: z.number(),
  subCaption: z.string(),
  subCaptionRelFontSize: z.number(),
  footnote: z.string(),
  footnoteRelFontSize: z.number(),
});

export const presentationObjectConfigSchema = z.object({
  d: configD,
  s: presentationObjectConfigSSchema,
  t: presentationObjectConfigTSchema,
});

export type PresentationObjectConfig = z.infer<
  typeof presentationObjectConfigSchema
>;
