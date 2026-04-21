// ============================================================================
// Visualization Config & Metric Schemas — INSTALLED SHAPE
//
// This file is the foundation for visualization-related schemas:
//   - configDStrict, configSStrict (used by PO configs and viz presets)
//   - Metric column schemas (ai_description, viz_presets)
//   - Shared atoms (translatableString, disaggregationOption, periodOption)
//   - Legacy adapters for these schemas
//
// Import hierarchy:
//   - This file imports from: conditional_formatting.ts, legacy_cf_presets.ts,
//     presentation_objects.ts
//   - _presentation_object_config.ts imports FROM this file
//   - _module_definition_installed.ts imports FROM this file (if needed)
// ============================================================================

import { z } from "zod";
import { cfStorageSchema } from "./conditional_formatting.ts";
import { ALL_DISAGGREGATION_OPTIONS } from "./disaggregation_options.ts";

// ============================================================================
// Atoms
// ============================================================================

export const translatableString = z.object({
  en: z.string(),
  fr: z.string(),
});

export const periodOption = z.enum(["period_id", "quarter_id", "year"]);
export const disaggregationOption = z.enum(ALL_DISAGGREGATION_OPTIONS);

// ============================================================================
// ConfigD Schema (visualization data config)
// ============================================================================

export const presentationOptionSchema = z.enum(["timeseries", "table", "chart", "map"]);
export const disaggregationDisplayOptionSchema = z.enum([
  "row",
  "rowGroup",
  "col",
  "colGroup",
  "series",
  "cell",
  "indicator",
  "replicant",
  "mapArea",
]);

export const relativePeriodFilterSchema = z.object({
  filterType: z.enum([
    "last_n_months",
    "last_calendar_year",
    "last_calendar_quarter",
    "last_n_calendar_years",
    "last_n_calendar_quarters",
  ]),
  nMonths: z.number().optional(),
  nYears: z.number().optional(),
  nQuarters: z.number().optional(),
});

export const boundedPeriodFilterSchema = z.object({
  filterType: z.enum(["custom", "from_month"]),
  periodOption: periodOption,
  min: z.number(),
  max: z.number(),
  nMonths: z.number().optional(),
  nYears: z.number().optional(),
  nQuarters: z.number().optional(),
});

export const periodFilterStrict = z
  .discriminatedUnion("filterType", [relativePeriodFilterSchema, boundedPeriodFilterSchema])
  .optional();

export const configDStrict = z
  .object({
    type: presentationOptionSchema,
    timeseriesGrouping: periodOption.optional(),
    valuesDisDisplayOpt: disaggregationDisplayOptionSchema,
    valuesFilter: z.array(z.string()).min(1).optional(),
    disaggregateBy: z.array(
      z.object({
        disOpt: disaggregationOption,
        disDisplayOpt: disaggregationDisplayOptionSchema,
      }),
    ),
    filterBy: z.array(
      z.object({
        disOpt: disaggregationOption,
        values: z.array(z.union([z.string(), z.number()])).min(1),
      }),
    ),
    periodFilter: periodFilterStrict,
    selectedReplicantValue: z.string().optional(),
    includeNationalForAdminArea2: z.boolean().optional(),
    includeNationalPosition: z.enum(["bottom", "top"]).optional(),
  });
  // Note: Duplicate disDisplayOpt/disOpt entries are allowed in stored data.
  // The UI shows a warning and blocks rendering until user fixes it.

// ============================================================================
// ConfigS Schema (visualization style config)
// ============================================================================

export const configSStrict = z
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
    customSeriesStyles: z.array(
      z.object({
        color: z.string(),
        strokeWidth: z.number(),
        lineStyle: z.enum(["solid", "dashed"]),
      }),
    ),
    nColsInCellDisplay: z.union([z.literal("auto"), z.number()]),
    seriesColorFuncPropToUse: z
      .enum(["series", "cell", "col", "row"])
      .optional(),
    sortIndicatorValues: z.enum(["ascending", "descending", "none"]),
    formatAdminArea3Labels: z.boolean().optional(),
    mapProjection: z.enum(["equirectangular", "mercator", "naturalEarth1"]),
  })
  .merge(cfStorageSchema)
  .partial();

// ============================================================================
// Viz Preset Text Config Schema
// ============================================================================

export const vizPresetTextConfigInstalledStrict = z.object({
  caption: translatableString.nullable(),
  captionRelFontSize: z.number().nullable(),
  subCaption: translatableString.nullable(),
  subCaptionRelFontSize: z.number().nullable(),
  footnote: translatableString.nullable(),
  footnoteRelFontSize: z.number().nullable(),
});

// ============================================================================
// Metric AI Description Schema (metrics.ai_description column)
// ============================================================================

export const metricAIDescriptionInstalledStrict = z.object({
  summary: translatableString,
  methodology: translatableString,
  interpretation: translatableString,
  typicalRange: translatableString,
  caveats: translatableString.nullable(),
  useCases: z.array(translatableString),
  relatedMetrics: z.array(z.string()),
  disaggregationGuidance: translatableString,
  importantNotes: translatableString.nullable(),
});

export const metricAIDescriptionInstalled = metricAIDescriptionInstalledStrict;

// ============================================================================
// Viz Preset Schema (metrics.viz_presets column)
// ============================================================================

export const vizPresetInstalledStrict = z.object({
  id: z.string(),
  label: translatableString,
  description: translatableString,
  importantNotes: translatableString.nullable(),
  needsReplicant: z.boolean(),
  allowedFilters: z.array(disaggregationOption),
  createDefaultVisualizationOnInstall: z.string().nullable(),
  config: z.object({
    d: configDStrict,
    s: configSStrict,
    t: vizPresetTextConfigInstalledStrict,
  }),
});

export const vizPresetInstalled = vizPresetInstalledStrict;

// ============================================================================
// Full Metric Schema (metrics table row)
// ============================================================================

export const valueFuncStrict = z.enum(["SUM", "AVG", "COUNT", "MIN", "MAX", "identity"]);

export const postAggregationExpressionStrict = z.object({
  ingredientValues: z.array(z.object({ prop: z.string(), func: z.enum(["SUM", "AVG"]) })),
  expression: z.string(),
});

export const metricStrict = z.object({
  id: z.string(),
  label: z.string(),
  variantLabel: z.string().nullable(),
  valueFunc: valueFuncStrict,
  formatAs: z.enum(["percent", "number"]),
  valueProps: z.array(z.string()),
  requiredDisaggregationOptions: z.array(disaggregationOption),
  valueLabelReplacements: z.record(z.string(), z.string()).nullable(),
  postAggregationExpression: postAggregationExpressionStrict.nullable(),
  resultsObjectId: z.string(),
  aiDescription: metricAIDescriptionInstalledStrict.nullable(),
  vizPresets: z.array(vizPresetInstalledStrict),
  hide: z.boolean(),
  importantNotes: z.string().nullable(),
});

// ============================================================================
// Types
// ============================================================================

export type PeriodOption = z.infer<typeof periodOption>;
export type PresentationOption = z.infer<typeof presentationOptionSchema>;
export type DisaggregationDisplayOption = z.infer<typeof disaggregationDisplayOptionSchema>;
export type RelativePeriodFilter = z.infer<typeof relativePeriodFilterSchema>;
export type BoundedPeriodFilter = z.infer<typeof boundedPeriodFilterSchema>;
export type PeriodFilter = RelativePeriodFilter | BoundedPeriodFilter;
export type ValueFunc = z.infer<typeof valueFuncStrict>;
export type PostAggregationExpression = z.infer<typeof postAggregationExpressionStrict>;
export type VizPresetTextConfig = z.infer<typeof vizPresetTextConfigInstalledStrict>;
export type VizPreset = z.infer<typeof vizPresetInstalledStrict>;
export type MetricAIDescription = z.infer<typeof metricAIDescriptionInstalledStrict>;
export type Metric = z.infer<typeof metricStrict>;
