// All module-definition types are derived from the Zod schemas in
// `module_definition_validator.ts` (single source of truth). This file
// re-exports them, and adds hand-written types for things that aren't
// Zod-validated (e.g. HFA internal types).

export type {
  ScriptGenerationType,
  DataSource,
  DataSourceDataset,
  DataSourceResultsObject,
  ModuleConfigRequirements,
  ModuleParameter,
  ResultsObjectDefinitionJSON,
  ValueFunc,
  PeriodOption,
  DisaggregationOption,
  PostAggregationExpression,
  VizPresetTextConfig,
  VizPreset,
  MetricAIDescription,
  MetricDefinitionJSON,
  ModuleDefinitionJSON,
} from "./module_definition_validator.ts";

// ----- Types NOT derived from Zod (HFA internals, not in module JSON) -----

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
