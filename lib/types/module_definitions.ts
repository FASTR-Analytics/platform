import { t3 } from "../translate/mod.ts";
import type { TranslatableString } from "../translate/types.ts";
import type { ModuleId } from "./module_registry.ts";
import type {
  PresentationObjectConfig,
} from "./presentation_objects.ts";

export type { ModuleId };

export type {
  ScriptGenerationType,
  DataSource,
  DataSourceDataset,
  DataSourceResultsObject,
  ModuleConfigRequirements,
  HfaIndicator,
  HfaIndicatorCode,
  HfaDictionaryForValidation,
  ModuleParameter,
  ResultsObjectDefinitionJSON,
  ValueFunc,
  PeriodOption,
  PostAggregationExpression,
  VizPresetTextConfig,
  VizPreset,
  MetricAIDescription,
  MetricDefinitionJSON,
  ModuleDefinitionJSON,
} from "./module_definition_schema.ts";

import type {
  ScriptGenerationType,
  DataSource,
  ModuleConfigRequirements,
  ValueFunc,
  PeriodOption,
  PostAggregationExpression,
  MetricAIDescription,
  VizPreset,
  MetricDefinitionJSON,
  ModuleDefinitionJSON,
  ResultsObjectDefinitionJSON,
} from "./module_definition_schema.ts";

import type {
  DisaggregationOption,
  PresentationOption,
} from "./presentation_objects.ts";

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
