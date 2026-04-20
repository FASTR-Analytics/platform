import { z } from "zod";
import { cfStorageSchema } from "./conditional_formatting.ts";
import { ALL_DISAGGREGATION_OPTIONS } from "./disaggregation_options.ts";

// ============================================================================
// Module Definition — GITHUB SHAPE.
//
// Strict schema for module definitions as authored in GitHub repos. Validated
// at fetch time by load_module.ts. Strict-all-the-way-down: NO preprocess,
// NO drift tolerance, NO defaults for missing fields. Authored definition.json
// files must match this shape exactly — incomplete or legacy shapes get
// rejected with clear error paths.
//
// MUST NOT import from _module_definition_installed.ts or _metric_installed.ts.
// GitHub and installed schemas are independent — shared atoms live in
// foundational files (conditional_formatting.ts, disaggregation_options.ts).
// Where sub-shapes are structurally identical to the installed file, they are
// duplicated here on purpose.
// ============================================================================

// ── Atoms ───────────────────────────────────────────────────────────

const translatableStringGithub = z.object({
  en: z.string(),
  fr: z.string(),
});

const scriptGenerationTypeGithub = z.enum(["template", "hfa"]);

const dataSourceDatasetGithub = z.object({
  sourceType: z.literal("dataset"),
  replacementString: z.string(),
  datasetType: z.enum(["hmis", "hfa"]),
});

const dataSourceResultsObjectGithub = z.object({
  sourceType: z.literal("results_object"),
  replacementString: z.string(),
  resultsObjectId: z.string(),
  moduleId: z.string(),
});

const dataSourceGithub = z.discriminatedUnion("sourceType", [
  dataSourceDatasetGithub,
  dataSourceResultsObjectGithub,
]);

const moduleParameterInputGithub = z.discriminatedUnion("inputType", [
  z.object({ inputType: z.literal("number"), defaultValue: z.string() }),
  z.object({ inputType: z.literal("text"), defaultValue: z.string() }),
  z.object({
    inputType: z.literal("boolean"),
    defaultValue: z.enum(["TRUE", "FALSE"]),
  }),
  z.object({
    inputType: z.literal("select"),
    valueType: z.enum(["string", "number"]),
    options: z.array(z.object({ value: z.string(), label: z.string() })),
    defaultValue: z.string(),
  }),
]);

const moduleParameterGithub = z.object({
  replacementString: z.string(),
  description: z.string(),
  input: moduleParameterInputGithub,
});

const configRequirementsGithub = z.object({
  parameters: z.array(moduleParameterGithub),
});

const valueFuncGithub = z.enum(["SUM", "AVG", "COUNT", "MIN", "MAX", "identity"]);
const periodOptionGithub = z.enum(["period_id", "quarter_id", "year"]);
const disaggregationOptionGithub = z.enum(ALL_DISAGGREGATION_OPTIONS);

const postAggregationExpressionGithub = z.object({
  ingredientValues: z.array(
    z.object({
      prop: z.string(),
      func: z.enum(["SUM", "AVG"]),
    }),
  ),
  expression: z.string(),
});

const presentationOptionGithub = z.enum(["timeseries", "table", "chart", "map"]);
const disaggregationDisplayOptionGithub = z.enum([
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

const relativePeriodFilterGithub = z.object({
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

const boundedPeriodFilterGithub = z.object({
  filterType: z.enum(["custom", "from_month"]),
  periodOption: periodOptionGithub,
  min: z.number(),
  max: z.number(),
  nMonths: z.number().optional(),
  nYears: z.number().optional(),
  nQuarters: z.number().optional(),
});

const periodFilterGithub = z
  .discriminatedUnion("filterType", [
    relativePeriodFilterGithub,
    boundedPeriodFilterGithub,
  ])
  .optional();

// ── Component schemas (config tree) ─────────────────────────────────

const configDGithubStrict = z
  .object({
    type: presentationOptionGithub,
    timeseriesGrouping: periodOptionGithub.optional(),
    valuesDisDisplayOpt: disaggregationDisplayOptionGithub,
    valuesFilter: z.array(z.string()).optional(),
    disaggregateBy: z.array(
      z.object({
        disOpt: disaggregationOptionGithub,
        disDisplayOpt: disaggregationDisplayOptionGithub,
      }),
    ),
    filterBy: z.array(
      z.object({
        disOpt: disaggregationOptionGithub,
        values: z.array(z.union([z.string(), z.number()])).min(1),
      }),
    ),
    periodFilter: periodFilterGithub,
    selectedReplicantValue: z.string().optional(),
    includeNationalForAdminArea2: z.boolean().optional(),
    includeNationalPosition: z.enum(["bottom", "top"]).optional(),
  });
  // Note: Duplicate disDisplayOpt/disOpt entries are allowed — UI handles gracefully.

// configS for github vizPresets: every field optional via .partial(). Github
// authors don't need to repeat all the cf* defaults — they just override what
// they want. CF storage keys come from cfStorageSchema (shared foundational
// primitive). If you change this schema, keep the corresponding
// configSStrict in _module_definition_installed.ts in lockstep.
const configSGithubStrict = z
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

const vizPresetTextConfigGithubStrict = z.object({
  caption: translatableStringGithub.nullable(),
  captionRelFontSize: z.number().nullable(),
  subCaption: translatableStringGithub.nullable(),
  subCaptionRelFontSize: z.number().nullable(),
  footnote: translatableStringGithub.nullable(),
  footnoteRelFontSize: z.number().nullable(),
});

// ── vizPreset (github) ──────────────────────────────────────────────

const vizPresetGithub = z.object({
  id: z.string(),
  label: translatableStringGithub,
  description: translatableStringGithub,
  importantNotes: translatableStringGithub.nullable(),
  needsReplicant: z.boolean(),
  allowedFilters: z.array(disaggregationOptionGithub),
  createDefaultVisualizationOnInstall: z.string().nullable(),
  config: z.object({
    d: configDGithubStrict,
    s: configSGithubStrict,
    t: vizPresetTextConfigGithubStrict,
  }),
});

// ── metricAIDescription (github) ────────────────────────────────────

const metricAIDescriptionGithub = z.object({
  summary: translatableStringGithub,
  methodology: translatableStringGithub,
  interpretation: translatableStringGithub,
  typicalRange: translatableStringGithub,
  caveats: translatableStringGithub.nullable(),
  useCases: z.array(translatableStringGithub),
  relatedMetrics: z.array(z.string()),
  disaggregationGuidance: translatableStringGithub,
  importantNotes: translatableStringGithub.nullable(),
});

// ── metricDefinition (github) ───────────────────────────────────────

const metricDefinitionGithub = z.object({
  id: z.string(),
  label: translatableStringGithub,
  variantLabel: translatableStringGithub.nullable(),
  valueProps: z.array(z.string()),
  valueFunc: valueFuncGithub,
  formatAs: z.enum(["percent", "number"]),
  requiredDisaggregationOptions: z.array(disaggregationOptionGithub),
  valueLabelReplacements: z.record(z.string(), z.string()),
  postAggregationExpression: postAggregationExpressionGithub.nullable(),
  resultsObjectId: z.string(),
  aiDescription: metricAIDescriptionGithub.nullable(),
  importantNotes: translatableStringGithub.nullable(),
  vizPresets: z.array(vizPresetGithub),
  hide: z.boolean(),
});

// ── resultsObjectDefinition (github) ────────────────────────────────

const resultsObjectDefinitionGithub = z.object({
  id: z.string(),
  description: z.string(),
  createTableStatementPossibleColumns: z.record(z.string(), z.string()),
});

// ── moduleDefinition (github — full file) ───────────────────────────

export const moduleDefinitionGithubSchema = z
  .object({
    label: translatableStringGithub,
    prerequisites: z.array(z.string()),
    scriptGenerationType: scriptGenerationTypeGithub,
    dataSources: z.array(dataSourceGithub),
    configRequirements: configRequirementsGithub,
    assetsToImport: z.array(z.string()),
    resultsObjects: z.array(resultsObjectDefinitionGithub),
    metrics: z.array(metricDefinitionGithub),
  })
  .superRefine((def, ctx) => {
    const resultsObjectIds = new Set(def.resultsObjects.map((ro) => ro.id));
    const metricIds = new Set<string>();
    for (const metric of def.metrics) {
      if (metricIds.has(metric.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate metric ID: "${metric.id}"`,
          path: ["metrics"],
        });
      }
      metricIds.add(metric.id);
      if (!resultsObjectIds.has(metric.resultsObjectId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Metric "${metric.id}" references unknown resultsObjectId "${metric.resultsObjectId}"`,
          path: ["metrics"],
        });
      }
    }
    const roIds = new Set<string>();
    for (const ro of def.resultsObjects) {
      if (roIds.has(ro.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate results object ID: "${ro.id}"`,
          path: ["resultsObjects"],
        });
      }
      roIds.add(ro.id);
    }
    const metricsByLabel = new Map<string, typeof def.metrics>();
    for (const metric of def.metrics) {
      const labelKey = metric.label.en;
      const existing = metricsByLabel.get(labelKey) ?? [];
      existing.push(metric);
      metricsByLabel.set(labelKey, existing);
    }
    for (const [label, metricsWithLabel] of metricsByLabel.entries()) {
      if (metricsWithLabel.length > 1) {
        const missingVariant = metricsWithLabel.filter((m) => !m.variantLabel);
        if (missingVariant.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Metrics with label "${label}" have ${metricsWithLabel.length} entries but ${missingVariant.length} are missing variantLabel: ${missingVariant.map((m) => m.id).join(", ")}`,
            path: ["metrics"],
          });
        }
      }
    }
  });

// ── Derived types ───────────────────────────────────────────────────

export type ModuleDefinitionGithub = z.infer<typeof moduleDefinitionGithubSchema>;
export type MetricDefinitionGithub = z.infer<typeof metricDefinitionGithub>;
export type ResultsObjectDefinitionGithub = z.infer<typeof resultsObjectDefinitionGithub>;