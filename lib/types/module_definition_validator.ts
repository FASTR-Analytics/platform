import { z } from "zod";

export const translatableString = z.object({
  en: z.string(),
  fr: z.string(),
});

export const scriptGenerationType = z.enum(["template", "hfa"]);

export const dataSourceDataset = z.object({
  sourceType: z.literal("dataset"),
  replacementString: z.string(),
  datasetType: z.enum(["hmis", "hfa"]),
});

export const dataSourceResultsObject = z.object({
  sourceType: z.literal("results_object"),
  replacementString: z.string(),
  resultsObjectId: z.string(),
  moduleId: z.string(),
});

export const dataSource = z.discriminatedUnion("sourceType", [
  dataSourceDataset,
  dataSourceResultsObject,
]);

export const moduleParameterInput = z.discriminatedUnion("inputType", [
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

export const moduleParameter = z.object({
  replacementString: z.string(),
  description: z.string(),
  input: moduleParameterInput,
});

export const configRequirements = z.object({
  parameters: z.array(moduleParameter),
});

export const resultsObjectDefinition = z.object({
  id: z.string(),
  description: z.string(),
  createTableStatementPossibleColumns: z
    .record(z.string(), z.string())
    .optional(),
});

export const valueFunc = z.enum(["SUM", "AVG", "COUNT", "MIN", "MAX", "identity"]);
export const periodOption = z.enum(["period_id", "quarter_id", "year"]);

export const disaggregationOption = z.enum([
  "indicator_common_id",
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
  "year",
  "month",
  "quarter_id",
  "period_id",
  "denominator",
  "denominator_best_or_survey",
  "source_indicator",
  "target_population",
  "ratio_type",
  "facility_name",
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
  "hfa_indicator",
  "hfa_category",
  "time_point",
]);

export const postAggregationExpression = z.object({
  ingredientValues: z.array(
    z.object({
      prop: z.string(),
      func: z.enum(["SUM", "AVG"]),
    }),
  ),
  expression: z.string(),
});

const presentationOption = z.enum(["timeseries", "table", "chart", "map"]);

const disaggregationDisplayOption = z.enum([
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

const relativePeriodFilter = z.object({
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

const boundedPeriodFilter = z.object({
  filterType: z.enum(["custom", "from_month"]),
  periodOption: periodOption,
  min: z.number(),
  max: z.number(),
  nMonths: z.number().optional(),
  nYears: z.number().optional(),
  nQuarters: z.number().optional(),
});

const periodFilter = z
  .discriminatedUnion("filterType", [relativePeriodFilter, boundedPeriodFilter])
  .optional();

const configD = z.object({
  type: presentationOption,
  timeseriesGrouping: periodOption.optional(),
  valuesDisDisplayOpt: disaggregationDisplayOption,
  valuesFilter: z.array(z.string()).optional(),
  disaggregateBy: z.array(
    z.object({
      disOpt: disaggregationOption,
      disDisplayOpt: disaggregationDisplayOption,
    }),
  ),
  filterBy: z.array(
    z.object({
      disOpt: disaggregationOption,
      values: z.array(z.string()),
    }),
  ),
  periodFilter: periodFilter,
  selectedReplicantValue: z.string().optional(),
  includeNationalForAdminArea2: z.boolean().optional(),
  includeNationalPosition: z.enum(["bottom", "top"]).optional(),
});

const configS = z
  .object({
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
  })
  .partial();

export const vizPresetTextConfig = z.object({
  caption: translatableString.optional(),
  captionRelFontSize: z.number().optional(),
  subCaption: translatableString.optional(),
  subCaptionRelFontSize: z.number().optional(),
  footnote: translatableString.optional(),
  footnoteRelFontSize: z.number().optional(),
});

export const vizPreset = z.object({
  id: z.string(),
  label: translatableString,
  description: translatableString,
  importantNotes: translatableString.optional(),
  needsReplicant: z.boolean().optional(),
  allowedFilters: z.array(disaggregationOption).optional(),
  createDefaultVisualizationOnInstall: z.string().optional(),
  config: z.object({
    d: configD,
    s: configS.optional(),
    t: vizPresetTextConfig.optional(),
  }),
});

export const metricAIDescription = z.object({
  summary: translatableString,
  methodology: translatableString,
  interpretation: translatableString,
  typicalRange: translatableString,
  caveats: translatableString.optional(),
  useCases: z.array(translatableString),
  relatedMetrics: z.array(z.string()).optional(),
  disaggregationGuidance: translatableString,
  importantNotes: translatableString.optional(),
});

export const metricDefinitionJSON = z.object({
  id: z.string(),
  label: translatableString,
  variantLabel: translatableString.optional(),
  valueProps: z.array(z.string()),
  valueFunc: valueFunc,
  formatAs: z.enum(["percent", "number"]),
  requiredDisaggregationOptions: z.array(disaggregationOption),
  valueLabelReplacements: z.record(z.string(), z.string()).optional(),
  postAggregationExpression: postAggregationExpression.optional(),
  resultsObjectId: z.string(),
  aiDescription: metricAIDescription.optional(),
  importantNotes: translatableString.optional(),
  vizPresets: z.array(vizPreset).optional(),
  hide: z.boolean().optional(),
});

export const moduleDefinitionCore = z.object({
  label: translatableString,
  prerequisites: z.array(z.string()),
  scriptGenerationType: scriptGenerationType,
  dataSources: z.array(dataSource),
  assetsToImport: z.array(z.string()),
});

export type TranslatableString = z.infer<typeof translatableString>;
export type ScriptGenerationType = z.infer<typeof scriptGenerationType>;
export type DataSource = z.infer<typeof dataSource>;
export type DataSourceDataset = z.infer<typeof dataSourceDataset>;
export type DataSourceResultsObject = z.infer<typeof dataSourceResultsObject>;
export type ModuleParameter = z.infer<typeof moduleParameter>;
export type ModuleConfigRequirements = z.infer<typeof configRequirements>;
export type ResultsObjectDefinitionJSON = z.infer<
  typeof resultsObjectDefinition
>;
export type ValueFunc = z.infer<typeof valueFunc>;
export type PeriodOption = z.infer<typeof periodOption>;
export type DisaggregationOption = z.infer<typeof disaggregationOption>;
export type PostAggregationExpression = z.infer<
  typeof postAggregationExpression
>;
export type VizPresetTextConfig = z.infer<typeof vizPresetTextConfig>;
export type VizPreset = z.infer<typeof vizPreset>;
export type MetricAIDescription = z.infer<typeof metricAIDescription>;
export type MetricDefinitionJSON = z.infer<typeof metricDefinitionJSON>;
export type ModuleDefinitionCore = z.infer<typeof moduleDefinitionCore>;

export const ModuleDefinitionJSONSchema = z
  .object({
    label: translatableString,
    prerequisites: z.array(z.string()),
    scriptGenerationType: scriptGenerationType,
    dataSources: z.array(dataSource),
    configRequirements: configRequirements,
    assetsToImport: z.array(z.string()),
    resultsObjects: z.array(resultsObjectDefinition),
    metrics: z.array(metricDefinitionJSON),
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

export type ValidatedModuleDefinitionJSON = z.infer<
  typeof ModuleDefinitionJSONSchema
>;

export type ModuleDefinitionJSON = ValidatedModuleDefinitionJSON;
