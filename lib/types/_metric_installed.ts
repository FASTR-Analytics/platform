// ============================================================================
// Visualization Config & Metric Schemas: INSTALLED SHAPE
//
// This file is the foundation for visualization-related schemas:
//   - configDStrict, configSStrict (used by PO configs and viz presets)
//   - Metric column schemas (ai_description, viz_presets)
//   - Shared atoms (translatableString, disaggregationOption)
//   - Legacy adapters for these schemas
//
// Import hierarchy:
//   - This file imports from: conditional_formatting.ts,
//     disaggregation_options.ts, period_options.ts, value_func.ts
//   - _presentation_object_config.ts imports FROM this file
//   - _module_definition_installed.ts imports FROM this file (if needed)
// ============================================================================

import { z } from "zod";
import { cfStorageSchema } from "./conditional_formatting.ts";
import { ALL_DISAGGREGATION_OPTIONS } from "./disaggregation_options.ts";
import {
  inferPeriodFormatFromValuesIfTheSame,
  periodOption,
} from "./period_options.ts";
import { valueFuncStrict } from "./value_func.ts";

// ============================================================================
// Atoms
// ============================================================================

export const translatableString = z.object({
  en: z.string(),
  fr: z.string(),
  pt: z.string().optional(),
});

export const disaggregationOption = z.enum(ALL_DISAGGREGATION_OPTIONS);

// ============================================================================
// ConfigD Schema (visualization data config)
// ============================================================================

export const presentationOptionSchema = z.enum([
  "timeseries",
  "table",
  "chart",
  "map",
  "pie",
]);
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

// Strict period filter schema: each filterType has exactly the fields it requires
const boundedFilterBase = z.object({
  min: z.number().int(),
  max: z.number().int(),
});

// Relative filters (resolved at query time)
const relativePeriodFilters = [
  z.object({
    filterType: z.literal("last_n_months"),
    nMonths: z.number().int().min(1),
  }),
  z.object({
    filterType: z.literal("last_calendar_year"),
  }),
  z.object({
    filterType: z.literal("last_calendar_quarter"),
  }),
  z.object({
    filterType: z.literal("last_n_calendar_years"),
    nYears: z.number().int().min(1),
  }),
  z.object({
    filterType: z.literal("last_n_calendar_quarters"),
    nQuarters: z.number().int().min(1),
  }),
] as const;

// The relative members alone: a period that names no dates, so it means the
// same thing in any package (a deck blueprint carries one as is).
export const relativePeriodFilterSchema = z.discriminatedUnion(
  "filterType",
  relativePeriodFilters,
);

const periodFilterUnion = z.discriminatedUnion("filterType", [
  ...relativePeriodFilters,
  // Bounded filters (explicit min/max)
  boundedFilterBase.extend({
    filterType: z.literal("custom"),
  }),
  boundedFilterBase.extend({
    filterType: z.literal("from_month"),
  }),
]);

export const periodFilterSchema = periodFilterUnion
  .refine(
    (filter) => {
      if (
        filter.filterType !== "custom" && filter.filterType !== "from_month"
      ) {
        return true;
      }
      // Both bounds must self-identify the same format, and be ordered.
      return (
        inferPeriodFormatFromValuesIfTheSame(filter.min, filter.max) !==
          undefined && filter.min <= filter.max
      );
    },
    {
      message:
        "Invalid period bounds: check min/max format and ensure min <= max",
    },
  )
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
        // Roll-up ("National" / "All facilities") on THIS dimension. Schema
        // allows the flag on any entry; the gate (getRollupDimension) only
        // honors exactly one flagged whitelisted entry. Canonical off-state is
        // both fields absent, but only the explicit client save path enforces
        // it (normalizePOConfigForStorage strips non-gate entries); the collab
        // checkpoint persists the live doc as-is, so collab-saved rows may
        // carry latent flags on gated-off entries. Read paths tolerate both
        // (SYSTEM_16 "canonical roll-up form" open item).
        rollup: z.boolean().optional(),
        rollupPosition: z.enum(["bottom", "top"]).optional(),
      }),
    ),
    filterBy: z.array(
      z.object({
        disOpt: disaggregationOption,
        values: z.array(z.union([z.string(), z.number()])).min(1),
      }),
    ),
    periodFilter: periodFilterSchema,
    selectedReplicantValue: z.string().optional(),
  });
// Note: Duplicate disDisplayOpt/disOpt entries are allowed in stored data.
// The UI shows a warning and blocks rendering until user fixes it.

// ============================================================================
// ConfigS Schema (visualization style config)
// ============================================================================

export const configSStrict = z
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
    specialDisruptionsChartV2: z.boolean(),
    verticalTickLabels: z.boolean(),
    horizontal: z.boolean().optional(),
    allowVerticalColHeaders: z.boolean(),
    showNValues: z.boolean().optional(),
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
    mapShowRegionLabels: z.boolean().optional(),
    mapDataLabelMode: z.enum(["none", "centroid", "callout", "auto"])
      .optional(),
    pieInnerRadiusRatio: z.number(),
    pieGroupSmallSlices: z.number(),
    pieCompletionMode: z.boolean(),
    pieShowCenterValue: z.boolean(),
    customValueOrder: z.array(
      z.object({
        disOpt: disaggregationOption,
        orderedIds: z.array(z.string()),
      }),
    ),
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
  disaggregationGuidance: translatableString,
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
  allowedFilters: z.array(disaggregationOption),
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

export const postAggregationExpressionStrict = z.object({
  ingredientValues: z.array(
    z.object({ prop: z.string(), func: z.enum(["SUM", "AVG"]) }),
  ),
  expression: z.string(),
});

// Declared catalog evaluation: the wire/display split that PAE metrics have,
// but declared rather than inferred. The named ingredient props are
// SUM-aggregated on the wire; the server then applies each indicator's own
// catalog expression to the aggregated row and returns one `value` column,
// which is why such a metric's valueProps stay ["value"].
export const catalogExpressionEvaluationStrict = z.object({
  ingredientProps: z.array(z.string()).min(1),
});

export const metricStrict = z.object({
  id: z.string(),
  label: z.string(),
  variantLabel: z.string().nullable(),
  valueFunc: valueFuncStrict,
  formatAs: z.enum(["percent", "number", "indicator"]),
  valueProps: z.array(z.string()),
  requiredDisaggregationOptions: z.array(disaggregationOption),
  valueLabelReplacements: z.record(z.string(), z.string()).nullable(),
  postAggregationExpression: postAggregationExpressionStrict.nullable(),
  catalogExpressionEvaluation: catalogExpressionEvaluationStrict.nullable(),
  resultsObjectId: z.string(),
  aiDescription: metricAIDescriptionInstalledStrict.nullable(),
  vizPresets: z.array(vizPresetInstalledStrict),
  hide: z.boolean(),
  importantNotes: z.string().nullable(),
});

// ============================================================================
// Types
// ============================================================================

export type PresentationOption = z.infer<typeof presentationOptionSchema>;
export type DisaggregationDisplayOption = z.infer<
  typeof disaggregationDisplayOptionSchema
>;
export type PeriodFilter = z.infer<typeof periodFilterSchema>;
export type BoundedPeriodFilter = Extract<
  NonNullable<PeriodFilter>,
  { filterType: "custom" | "from_month" }
>;
export type RelativePeriodFilter = Exclude<
  NonNullable<PeriodFilter>,
  BoundedPeriodFilter
>;
export type PostAggregationExpression = z.infer<
  typeof postAggregationExpressionStrict
>;
export type CatalogExpressionEvaluation = z.infer<
  typeof catalogExpressionEvaluationStrict
>;
export type VizPresetTextConfig = z.infer<
  typeof vizPresetTextConfigInstalledStrict
>;
export type VizPreset = z.infer<typeof vizPresetInstalledStrict>;
export type MetricAIDescription = z.infer<
  typeof metricAIDescriptionInstalledStrict
>;
export type Metric = z.infer<typeof metricStrict>;
