import { z } from "zod";
import { t3 } from "../translate/mod.ts";
import type { TranslatableString } from "../translate/types.ts";
import { cfStorageSchema } from "./conditional_formatting.ts";
import type { ModuleId } from "./module_registry.ts";
import type { PresentationObjectConfig } from "./presentation_object_config.ts";
import {
  ALL_DISAGGREGATION_OPTIONS,
  type DisaggregationOption,
  type PresentationOption,
} from "./presentation_objects.ts";

export type { ModuleId };

// ============================================================================
// Zod schemas — single source of truth for module-JSON shape.
// ============================================================================

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
  createTableStatementPossibleColumns: z.record(z.string(), z.string()),
});

export const valueFunc = z.enum(["SUM", "AVG", "COUNT", "MIN", "MAX", "identity"]);
export const periodOption = z.enum(["period_id", "quarter_id", "year"]);

export const disaggregationOption = z.enum(ALL_DISAGGREGATION_OPTIONS);

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

export const configD = z
  .object({
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
        values: z.array(z.string()).min(1),
      }),
    ),
    periodFilter: periodFilter,
    selectedReplicantValue: z.string().optional(),
    includeNationalForAdminArea2: z.boolean().optional(),
    includeNationalPosition: z.enum(["bottom", "top"]).optional(),
  })
  // PERMANENT invariant: every non-replicant display slot is single-use.
  // series/row/col/cell/etc. each identify exactly one dimension.
  .refine(
    (d) => {
      const slots = d.disaggregateBy
        .map((x) => x.disDisplayOpt)
        .filter((opt) => opt !== "replicant");
      return new Set(slots).size === slots.length;
    },
    { message: "disaggregateBy contains duplicate non-replicant disDisplayOpt entries" },
  )
  // TEMPORARY invariant: multi-replicant (cross-product of replicated
  // dimensions) is not yet supported by the runtime. Lift this when that
  // work ships — the permanent refinement above stays untouched.
  .refine(
    (d) => d.disaggregateBy.filter((x) => x.disDisplayOpt === "replicant").length <= 1,
    { message: "Multi-replicant not yet implemented — at most one replicant allowed" },
  )
  // No duplicate disOpt entries in disaggregateBy — a single dimension can't
  // be drawn twice in the same viz.
  .refine(
    (d) => new Set(d.disaggregateBy.map((x) => x.disOpt)).size === d.disaggregateBy.length,
    { message: "disaggregateBy contains duplicate disOpt entries" },
  );

export const configS = z
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

export const vizPresetTextConfig = z.object({
  caption: translatableString.nullable(),
  captionRelFontSize: z.number().nullable(),
  subCaption: translatableString.nullable(),
  subCaptionRelFontSize: z.number().nullable(),
  footnote: translatableString.nullable(),
  footnoteRelFontSize: z.number().nullable(),
});

export const vizPreset = z.object({
  id: z.string(),
  label: translatableString,
  description: translatableString,
  importantNotes: translatableString.nullable(),
  needsReplicant: z.boolean(),
  allowedFilters: z.array(disaggregationOption),
  createDefaultVisualizationOnInstall: z.string().nullable(),
  config: z.object({
    d: configD,
    s: configS,
    t: vizPresetTextConfig,
  }),
});

export const metricAIDescription = z.object({
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

export const metricDefinitionJSON = z.object({
  id: z.string(),
  label: translatableString,
  variantLabel: translatableString.nullable(),
  valueProps: z.array(z.string()),
  valueFunc: valueFunc,
  formatAs: z.enum(["percent", "number"]),
  requiredDisaggregationOptions: z.array(disaggregationOption),
  valueLabelReplacements: z.record(z.string(), z.string()),
  postAggregationExpression: postAggregationExpression.nullable(),
  resultsObjectId: z.string(),
  aiDescription: metricAIDescription.nullable(),
  importantNotes: translatableString.nullable(),
  vizPresets: z.array(vizPreset),
  hide: z.boolean(),
});

export const moduleDefinitionCore = z.object({
  label: translatableString,
  prerequisites: z.array(z.string()),
  scriptGenerationType: scriptGenerationType,
  dataSources: z.array(dataSource),
  assetsToImport: z.array(z.string()),
});

// ============================================================================
// Derived types (z.infer) — single source of truth.
// Note: DisaggregationOption is declared in presentation_objects.ts (same
// runtime array seeds both the TS union and the Zod enum above), so it's
// imported there rather than re-declared here.
// ============================================================================

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
export type PostAggregationExpression = z.infer<
  typeof postAggregationExpression
>;
export type ModuleDefinitionCore = z.infer<typeof moduleDefinitionCore>;
export type VizPresetTextConfig = z.infer<typeof vizPresetTextConfig>;
export type VizPreset = z.infer<typeof vizPreset>;
export type MetricAIDescription = z.infer<typeof metricAIDescription>;
export type MetricDefinitionJSON = z.infer<typeof metricDefinitionJSON>;

// ============================================================================
// Stored-side Zod schemas
//
// Describe the shape written to modules.module_definition and the denormalized
// columns in the metrics table by the install flow in load_module.ts. These
// are the schemas used at DB-read trust boundaries (item A / item C).
//
// Why this is separate from the fetch schemas above:
//   - The install flow resolves TranslatableString to plain string
//     (label/variantLabel/importantNotes on metrics and modules).
//   - The install flow strips null to undefined (key dropped by
//     JSON.stringify) on outer fields like aiDescription, vizPresets,
//     variantLabel, valueLabelReplacements, postAggregationExpression.
//   - Runtime fields (id, lastScriptUpdate, script, defaultPresentationObjects)
//     are added.
//   - Fields migrated from .optional() → .nullable() in the fetch schema on
//     2026-04-17 (commit 75235e8) may still be absent on rows written before
//     that; stored-side nested fields use .nullable().default(null) to accept
//     either absent or null.
// ============================================================================

export const vizPresetTextConfigStored = z.object({
  caption: translatableString.nullable().default(null),
  captionRelFontSize: z.number().nullable().default(null),
  subCaption: translatableString.nullable().default(null),
  subCaptionRelFontSize: z.number().nullable().default(null),
  footnote: translatableString.nullable().default(null),
  footnoteRelFontSize: z.number().nullable().default(null),
});

const VIZ_TEXT_NULL_DEFAULT = {
  caption: null,
  captionRelFontSize: null,
  subCaption: null,
  subCaptionRelFontSize: null,
  footnote: null,
  footnoteRelFontSize: null,
};

export const vizPresetStored = z.object({
  id: z.string(),
  label: translatableString,
  description: translatableString,
  importantNotes: translatableString.nullable().default(null),
  needsReplicant: z.boolean().optional().default(false),
  allowedFilters: z.array(disaggregationOption).optional().default([]),
  createDefaultVisualizationOnInstall: z.string().nullable().default(null),
  config: z.object({
    d: configD,
    s: configS.optional().default({}),
    t: vizPresetTextConfigStored.optional().default(VIZ_TEXT_NULL_DEFAULT),
  }),
});

export const metricAIDescriptionStored = z.object({
  summary: translatableString,
  methodology: translatableString,
  interpretation: translatableString,
  typicalRange: translatableString,
  caveats: translatableString.nullable().default(null),
  useCases: z.array(translatableString),
  relatedMetrics: z.array(z.string()).optional().default([]),
  disaggregationGuidance: translatableString,
  importantNotes: translatableString.nullable().default(null),
});

export const resultsObjectDefinitionStoredSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  description: z.string(),
  createTableStatementPossibleColumns: z.record(z.string(), z.string()).optional(),
});

export const metricDefinitionStoredSchema = z.object({
  id: z.string(),
  label: z.string(),
  variantLabel: z.string().optional(),
  valueProps: z.array(z.string()),
  valueFunc: valueFunc,
  formatAs: z.enum(["percent", "number"]),
  requiredDisaggregationOptions: z.array(disaggregationOption),
  valueLabelReplacements: z.record(z.string(), z.string()).optional(),
  postAggregationExpression: postAggregationExpression.optional(),
  resultsObjectId: z.string(),
  aiDescription: metricAIDescriptionStored.optional(),
  importantNotes: z.string().optional(),
  vizPresets: z.array(vizPresetStored).optional(),
  hide: z.boolean().optional(),
});

// defaultPresentationObjects[].config is a PresentationObjectConfig. The
// schema lives in presentation_object_config.ts which already imports configD
// from this file; importing its value here would create a value-level cycle.
// Validate the outer fields; keep .config as pass-through unknown — PO configs
// have their own strict-write / permissive-read validation at the
// presentation_objects read/write sites.
export const defaultPresentationObjectStoredSchema = z.object({
  id: z.string(),
  label: z.string(),
  moduleId: z.string(),
  metricId: z.string(),
  sortOrder: z.number(),
  config: z.unknown(),
});

// Top-level fields default to sensible values where legacy rows may lack
// them. `id` and `label` are identity — always present in any usable row.
// Everything else tolerates absence: older rows predate the addition of
// various fields (scriptGenerationType, defaultPresentationObjects, etc.).
export const moduleDefinitionStoredSchema = z.object({
  id: z.string(),
  label: z.string(),
  prerequisites: z.array(z.string()).optional().default([]),
  lastScriptUpdate: z.string().optional().default(""),
  commitSha: z.string().optional(),
  dataSources: z.array(dataSource).optional().default([]),
  scriptGenerationType: scriptGenerationType.optional().default("template"),
  configRequirements: configRequirements.optional().default({ parameters: [] }),
  script: z.string().optional().default(""),
  assetsToImport: z.array(z.string()).optional().default([]),
  resultsObjects: z.array(resultsObjectDefinitionStoredSchema).optional().default([]),
  metrics: z.array(metricDefinitionStoredSchema).optional().default([]),
  defaultPresentationObjects: z.array(defaultPresentationObjectStoredSchema).optional().default([]),
});

// Accepts the already-parsed and legacy-adapted JSON. Callers must run any
// relevant legacy adapters (e.g. adaptLegacyModuleDefinition from
// server/legacy_adapters/) before handing the object to this parser —
// adapter-before-Zod is the repo-wide convention, see DOC_legacy_handling.md.
export function parseModuleDefinition(raw: unknown): ModuleDefinition {
  return moduleDefinitionStoredSchema.parse(raw) as ModuleDefinition;
}

// ============================================================================
// Full module-definition JSON schema (validated at GitHub fetch time).
// ============================================================================

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

// ============================================================================
// HFA runtime types — not Zod-validated, used internally for HFA dataset
// processing (not part of the module JSON shape).
// ============================================================================

export type HfaIndicator = {
  varName: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sortOrder: number;
};

export type HfaIndicatorCode = {
  varName: string;
  timePoint: string;
  rCode: string;
  rFilterCode: string | undefined;
};

export type HfaDictionaryForValidation = {
  timePoints: {
    timePoint: string;
    timePointLabel: string;
    vars: { varName: string; varLabel: string; varType: string }[];
    values: { varName: string; value: string; valueLabel: string }[];
  }[];
};

// ============================================================================
// Runtime-enriched types — hand-authored (built from validated inputs by
// internal code; don't cross a trust boundary).
// Item D of PLAN_5 will replace ModuleDefinition with a z.infer from a new
// moduleDefinitionRuntime schema.
// ============================================================================

///////////////////
//               //
//    Modules    //
//               //
///////////////////

export type ModuleDefinition = {
  id: ModuleId;
  label: string;
  prerequisites: ModuleId[];
  lastScriptUpdate: string;
  commitSha?: string;
  dataSources: DataSource[];
  scriptGenerationType: ScriptGenerationType;
  configRequirements: ModuleConfigRequirements;
  script: string;
  assetsToImport: string[];
  resultsObjects: ResultsObjectDefinition[];
  metrics: MetricDefinition[];
  defaultPresentationObjects: DefaultPresentationObject[];
};

///////////////////////////
//                       //
//    Results objects    //
//                       //
///////////////////////////

export type ResultsObjectDefinition = {
  id: string;
  moduleId: string;
  description: string;
  createTableStatementPossibleColumns?: Record<string, string>;
};

//////////////////////////
//                      //
//    Results values    //
//                      //
//////////////////////////

export type ResultsValue = {
  id: string;
  resultsObjectId: string;
  valueProps: string[];
  valueFunc: ValueFunc;
  postAggregationExpression?: PostAggregationExpression;
  valueLabelReplacements?: Record<string, string>;
  label: string;
  variantLabel?: string;
  formatAs: "percent" | "number";
  disaggregationOptions: {
    value: DisaggregationOption;
    isRequired: boolean;
    allowedPresentationOptions?: PresentationOption[];
  }[];
  mostGranularTimePeriodColumnInResultsFile: PeriodOption | undefined;
  aiDescription?: MetricAIDescription;
  importantNotes?: string;
};

export type ResultsValueForVisualization = {
  formatAs: "percent" | "number";
  valueProps: string[];
  valueLabelReplacements?: Record<string, string>;
};

export type MetricStatus =
  | "ready"
  | "module_not_installed"
  | "results_not_ready"
  | "error";

export type MetricWithStatus = ResultsValue & {
  status: MetricStatus;
  moduleId: ModuleId;
  vizPresets?: VizPreset[];
};

export type ResultsValueDefinition = Omit<
  ResultsValue,
  "disaggregationOptions" | "mostGranularTimePeriodColumnInResultsFile"
> & {
  requiredDisaggregationOptions: DisaggregationOption[];
};

export type MetricDefinition = {
  id: string;
  label: string;
  variantLabel?: string;
  valueProps: string[];
  valueFunc: ValueFunc;
  formatAs: "percent" | "number";
  requiredDisaggregationOptions: DisaggregationOption[];
  valueLabelReplacements?: Record<string, string>;
  postAggregationExpression?: PostAggregationExpression;
  resultsObjectId: string;
  aiDescription?: MetricAIDescription;
  importantNotes?: string;
  vizPresets?: VizPreset[];
  hide?: boolean;
};

export type TranslatableAIString = TranslatableString;

export function get_PERIOD_OPTION_MAP(): Record<PeriodOption, string> {
  return {
    period_id: t3({ en: "Monthly", fr: "Mensuel" }),
    quarter_id: t3({ en: "Quarterly", fr: "Trimestriel" }),
    year: t3({ en: "Yearly", fr: "Annuellement" }),
  };
}

////////////////////////////////////////
//                                    //
//    Default presentation objects    //
//                                    //
////////////////////////////////////////

export type DefaultPresentationObject = {
  id: string;
  label: string;
  moduleId: string;
  metricId: string;
  sortOrder: number;
  config: PresentationObjectConfig;
};

////////////////////////////////////////
//                                    //
//    Module Definition JSON types    //
//                                    //
////////////////////////////////////////

export type ResultsValueDefinitionJSON = Omit<
  ResultsValueDefinition,
  "moduleId" | "resultsObjectId"
>;
