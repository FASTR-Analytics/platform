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
import {
  cfStorageSchema,
  flattenCf,
  CF_STORAGE_DEFAULTS,
  type ConditionalFormatting,
  type ConditionalFormattingScale,
} from "./conditional_formatting.ts";
import {
  LEGACY_CF_PRESETS,
  type LegacyCfPresetId,
} from "../legacy_cf_presets.ts";
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
// Adapters — pure, typed, per-level.
// ============================================================================

const RELATIVE_FILTER_TYPES = new Set([
  "last_n_months",
  "last_calendar_year",
  "last_calendar_quarter",
  "last_n_calendar_years",
  "last_n_calendar_quarters",
]);

export function adaptLegacyPeriodFilter(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const pf = { ...raw };
  if (pf.filterType === "last_12_months") {
    pf.filterType = "last_n_months";
    pf.nMonths = 12;
    delete pf.periodOption;
    delete pf.min;
    delete pf.max;
    return pf;
  }
  if (pf.filterType === undefined) {
    pf.filterType = "custom";
  }
  if (
    typeof pf.filterType === "string" &&
    RELATIVE_FILTER_TYPES.has(pf.filterType)
  ) {
    delete pf.periodOption;
    delete pf.min;
    delete pf.max;
  }
  return pf;
}

export function adaptLegacyConfigD(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if ("periodOpt" in out) {
    if (!("timeseriesGrouping" in out)) {
      out.timeseriesGrouping = out.periodOpt;
    }
    delete out.periodOpt;
  }
  if (out.periodFilter && typeof out.periodFilter === "object" && !Array.isArray(out.periodFilter)) {
    out.periodFilter = adaptLegacyPeriodFilter(
      out.periodFilter as Record<string, unknown>,
    );
  }
  return out;
}

const MAP_COLOR_PRESET_STOPS: Record<string, [string, string]> = {
  "red-green": ["#de2d26", "#31a354"],
  red: ["#fee0d2", "#de2d26"],
  blue: ["#deebf7", "#3182bd"],
  green: ["#e5f5e0", "#31a354"],
};

const MAP_NO_DATA_COLOR = "#f0f0f0";

function buildCfFromLegacyMapFields(
  s: Record<string, unknown>,
): ConditionalFormattingScale | undefined {
  const preset = (s.mapColorPreset as string | undefined) ?? "red-green";
  const reverse = Boolean(s.mapColorReverse);
  const [rawFrom, rawTo] =
    preset === "custom"
      ? [
          (s.mapColorFrom as string | undefined) ?? "#fee0d2",
          (s.mapColorTo as string | undefined) ?? "#de2d26",
        ]
      : MAP_COLOR_PRESET_STOPS[preset] ?? MAP_COLOR_PRESET_STOPS["red-green"];
  const [from, to] = reverse ? [rawTo, rawFrom] : [rawFrom, rawTo];

  const scaleType = (s.mapScaleType as string | undefined) ?? "continuous";
  const steps =
    scaleType === "discrete"
      ? (s.mapDiscreteSteps as number | undefined) ?? 5
      : undefined;

  const domainType = (s.mapDomainType as string | undefined) ?? "auto";
  const domain: ConditionalFormattingScale["domain"] =
    domainType === "fixed"
      ? {
          kind: "fixed",
          min: (s.mapDomainMin as number | undefined) ?? 0,
          max: (s.mapDomainMax as number | undefined) ?? 1,
        }
      : { kind: "auto" };

  return {
    type: "scale",
    scale: { min: from, max: to },
    steps,
    domain,
    noDataColor: MAP_NO_DATA_COLOR,
  };
}

function isLegacyCfPresetId(v: unknown): v is LegacyCfPresetId {
  return typeof v === "string" && v in LEGACY_CF_PRESETS;
}

export function adaptLegacyConfigS(
  raw: Record<string, unknown>,
  isMap: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  let legacyCf: ConditionalFormatting | undefined;

  if ("conditionalFormatting" in out) {
    const cfRaw = out.conditionalFormatting;
    if (isLegacyCfPresetId(cfRaw)) {
      legacyCf = LEGACY_CF_PRESETS[cfRaw].value;
    }
    delete out.conditionalFormatting;
  }

  if (
    isMap &&
    (!legacyCf || legacyCf.type === "none") &&
    ("mapColorPreset" in out ||
      "mapColorFrom" in out ||
      "mapColorTo" in out ||
      "mapColorReverse" in out ||
      "mapScaleType" in out ||
      "mapDiscreteSteps" in out ||
      "mapDomainType" in out ||
      "mapDomainMin" in out ||
      "mapDomainMax" in out)
  ) {
    const scaleCf = buildCfFromLegacyMapFields(out);
    if (scaleCf) legacyCf = scaleCf;
  }

  delete out.mapColorPreset;
  delete out.mapColorFrom;
  delete out.mapColorTo;
  delete out.mapColorReverse;
  delete out.mapScaleType;
  delete out.mapDiscreteSteps;
  delete out.mapDomainType;
  delete out.mapDomainMin;
  delete out.mapDomainMax;

  const flatSource = legacyCf ? flattenCf(legacyCf) : CF_STORAGE_DEFAULTS;
  for (const [key, value] of Object.entries(flatSource)) {
    if (!(key in out)) out[key] = value;
  }

  if (!("specialDisruptionsChart" in out)) {
    out.specialDisruptionsChart = out.diffAreas === true;
  }

  return out;
}

export function adaptLegacyVizPresetTextConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (!("caption" in out)) out.caption = null;
  if (!("captionRelFontSize" in out)) out.captionRelFontSize = null;
  if (!("subCaption" in out)) out.subCaption = null;
  if (!("subCaptionRelFontSize" in out)) out.subCaptionRelFontSize = null;
  if (!("footnote" in out)) out.footnote = null;
  if (!("footnoteRelFontSize" in out)) out.footnoteRelFontSize = null;
  return out;
}

export function adaptLegacyMetricAIDescription(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (!("caveats" in out)) out.caveats = null;
  if (!("importantNotes" in out)) out.importantNotes = null;
  if (!("relatedMetrics" in out)) out.relatedMetrics = [];
  return out;
}

export function adaptLegacyVizPreset(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  delete out.defaultPeriodFilterForDefaultVisualizations;

  if (!("importantNotes" in out)) out.importantNotes = null;
  if (!("createDefaultVisualizationOnInstall" in out)) {
    out.createDefaultVisualizationOnInstall = null;
  }
  if (!("needsReplicant" in out)) out.needsReplicant = false;
  if (!("allowedFilters" in out)) out.allowedFilters = [];

  if (out.config && typeof out.config === "object" && !Array.isArray(out.config)) {
    const cfg = { ...(out.config as Record<string, unknown>) };
    let isMap = false;
    if (cfg.d && typeof cfg.d === "object" && !Array.isArray(cfg.d)) {
      const d = adaptLegacyConfigD(cfg.d as Record<string, unknown>);
      isMap = (d as Record<string, unknown>).type === "map";
      cfg.d = d;
    } else {
      cfg.d = {};
    }
    if (cfg.s && typeof cfg.s === "object" && !Array.isArray(cfg.s)) {
      cfg.s = adaptLegacyConfigS(cfg.s as Record<string, unknown>, isMap);
    } else {
      cfg.s = {};
    }
    if (cfg.t && typeof cfg.t === "object" && !Array.isArray(cfg.t)) {
      cfg.t = adaptLegacyVizPresetTextConfig(cfg.t as Record<string, unknown>);
    } else {
      cfg.t = adaptLegacyVizPresetTextConfig({});
    }
    out.config = cfg;
  } else {
    out.config = {
      d: {},
      s: {},
      t: adaptLegacyVizPresetTextConfig({}),
    };
  }

  return out;
}

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
    valuesFilter: z.array(z.string()).optional(),
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

// Back-compat alias
export const configS = configSStrict;

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

export const metricAIDescriptionInstalled = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyMetricAIDescription(raw as Record<string, unknown>);
}, metricAIDescriptionInstalledStrict);

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

export const vizPresetInstalled = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  return adaptLegacyVizPreset(raw as Record<string, unknown>);
}, vizPresetInstalledStrict);

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
