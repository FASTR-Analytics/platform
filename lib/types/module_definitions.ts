import { t2, T } from "../translate/mod.ts";
import type { TranslatableString } from "../translate/types.ts";
import type { DatasetType } from "./datasets.ts";
import type { ModuleId } from "./module_metadata_generated.ts";
import {
  DisaggregationOption,
  PresentationOption,
  type PresentationObjectConfig,
} from "./presentation_objects.ts";

export type { ModuleId };

///////////////////
//               //
//    Modules    //
//               //
///////////////////

// Script source descriptor - where to load the R script from
export type ScriptSource =
  | { type: "local"; filename: string }
  | { type: "github"; owner: string; repo: string; path: string; commit: string; replacements?: { from: string; to: string }[] };

export type ModuleDefinition = {
  id: ModuleId;
  label: string;
  prerequisites: ModuleId[];
  lastScriptUpdate: string;
  commitSha?: string;
  scriptSource: ScriptSource;
  dataSources: DataSource[];
  configRequirements: ModuleConfigRequirements;
  script: string;
  assetsToImport: string[];
  resultsObjects: ResultsObjectDefinition[];
  metrics: MetricDefinition[];
  defaultPresentationObjects: DefaultPresentationObject[];
};

////////////////////////
//                    //
//    Data sources    //
//                    //
////////////////////////

export type DataSource = DataSourceDataset | DataSourceResultsObject;

export type DataSourceDataset = {
  sourceType: "dataset";
  replacementString: string;
  datasetType: DatasetType;
};

export type DataSourceResultsObject = {
  sourceType: "results_object";
  replacementString: string;
  resultsObjectId: string;
  moduleId: string;
};

//////////////////////
//                  //
//    Parameters    //
//                  //
//////////////////////

export type ModuleConfigRequirements =
  | {
      configType: "none";
    }
  | {
      configType: "parameters";
      parameters: ModuleParameter[];
    }
  | {
      configType: "hfa";
      indicators: HfaIndicator[];
    };

export type HfaIndicator = {
  category: string;
  definition: string;
  rFilterCode?: string;
  varName: string;
  rCode: string;
  type: "binary" | "numeric";
};

export type ModuleParameter = {
  replacementString: string;
  description: string;
  input:
    | {
        inputType: "number";
        defaultValue: string;
      }
    | {
        inputType: "text";
        defaultValue: string;
      }
    | {
        inputType: "boolean";
        defaultValue: "TRUE" | "FALSE";
      }
    | {
        inputType: "select";
        valueType: "string" | "number";
        options: { value: string; label: string }[];
        defaultValue: string;
      };
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

export type PostAggregationExpression = {
  ingredientValues: {
    prop: string;
    func: "SUM" | "AVG";
  }[];
  expression: string;
};

export type ValueFunc = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "identity";

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
    label: string | TranslatableString;
    isRequired: boolean;
    allowedPresentationOptions?: PresentationOption[];
  }[];
  periodOptions: PeriodOption[];
  autoIncludeFacilityColumns?: boolean;
  aiDescription?: MetricAIDescription;
  importantNotes?: string;
};

// Minimal subset used by visualization generation functions
export type ResultsValueForVisualization = {
  formatAs: "percent" | "number";
  valueProps: string[];
  valueLabelReplacements?: Record<string, string>;
};

// Status tracking for metrics availability
export type MetricStatus =
  | "ready"               // Module ran successfully, results available
  | "module_not_installed" // Metric in static data but module not installed
  | "results_not_ready"   // Module installed but hasn't run or no data yet
  | "error";              // Module ran but failed

// ResultsValue with status tracking for projectDetail.metrics
export type MetricWithStatus = ResultsValue & {
  status: MetricStatus;
  moduleId: ModuleId;
};

// Simplified type for module definitions - will be enriched at runtime
export type ResultsValueDefinition = Omit<
  ResultsValue,
  "disaggregationOptions"
> & {
  requiredDisaggregationOptions: DisaggregationOption[];
  // customDisaggregationOptions?: {
  //   value: DisaggregationOption;
  //   label: string;
  //   isRequired: boolean;
  //   allowedPresentationOptions?: PresentationOption[];
  // }[];
};

export type PeriodOption = "period_id" | "quarter_id" | "year";

export type MetricDefinition = {
  id: string;
  label: string;
  variantLabel?: string;
  valueProps: string[];
  valueFunc: ValueFunc;
  formatAs: "percent" | "number";
  periodOptions: PeriodOption[];
  requiredDisaggregationOptions: DisaggregationOption[];
  valueLabelReplacements?: Record<string, string>;
  postAggregationExpression?: PostAggregationExpression;
  autoIncludeFacilityColumns?: boolean;
  resultsObjectId: string;
  aiDescription?: MetricAIDescription;
  importantNotes?: string;
  vizPresets?: VizPreset[];
  hide?: boolean;
};

export type MetricDefinitionJSON = Omit<MetricDefinition, "label" | "variantLabel" | "importantNotes"> & {
  label: TranslatableString;
  variantLabel?: TranslatableString;
  importantNotes?: TranslatableString;
};

// Alias for backwards compatibility
export type TranslatableAIString = TranslatableString;

export type VizPresetTextConfig = {
  caption?: TranslatableString;
  captionRelFontSize?: number;
  subCaption?: TranslatableString;
  subCaptionRelFontSize?: number;
  footnote?: TranslatableString;
  footnoteRelFontSize?: number;
};

export type VizPreset = {
  id: string;
  label: TranslatableString;
  description: TranslatableString;
  importantNotes?: TranslatableString;
  needsReplicant?: boolean;
  allowedFilters?: DisaggregationOption[];
  createDefaultVisualizationOnInstall?: string;
  defaultPeriodFilterForDefaultVisualizations?: {
    nMonths: number;
  };
  config: {
    d: PresentationObjectConfig["d"];
    s?: Partial<PresentationObjectConfig["s"]>;
    t?: VizPresetTextConfig;
  };
};

export type MetricAIDescription = {
  summary: TranslatableString;
  methodology: TranslatableString;
  interpretation: TranslatableString;
  typicalRange: TranslatableString;
  caveats?: TranslatableString;
  useCases: TranslatableString[];
  relatedMetrics?: string[];
  disaggregationGuidance: TranslatableString;
  importantNotes?: TranslatableString;
};

export function get_PERIOD_OPTION_MAP(): Record<PeriodOption, string> {
  return {
    period_id: t2(T.FRENCH_UI_STRINGS.monthly),
    quarter_id: t2(T.FRENCH_UI_STRINGS.quarterly),
    year: t2(T.FRENCH_UI_STRINGS.yearly),
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

// JSON representation of results value - omits redundant IDs that can be inferred from parent/grandparent
export type ResultsValueDefinitionJSON = Omit<
  ResultsValueDefinition,
  "moduleId" | "resultsObjectId"
>;

// JSON representation of results object - omits moduleId which can be inferred from parent
export type ResultsObjectDefinitionJSON = Omit<ResultsObjectDefinition, "moduleId">;

// JSON representation of module definition (stored in built files)
// Script is stored separately and loaded at runtime
// id and lastScriptUpdate are inferred/added during build
export type ModuleDefinitionJSON = Omit<
  ModuleDefinition,
  "id" | "script" | "lastScriptUpdate" | "resultsObjects" | "defaultPresentationObjects" | "commitSha" | "label" | "metrics"
> & {
  label: TranslatableString;
  metrics: MetricDefinitionJSON[];
  resultsObjects: ResultsObjectDefinitionJSON[];
};

// Built JSON representation (after build process adds id and lastScriptUpdate)
export type BuiltModuleDefinitionJSON = ModuleDefinitionJSON & {
  id: ModuleId;
  lastScriptUpdate: string;
  commitSha?: string;
};
