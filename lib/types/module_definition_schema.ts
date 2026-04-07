import type { TranslatableString } from "../translate/types.ts";
import type { DatasetType } from "./datasets.ts";
import type {
  DisaggregationOption,
  PresentationObjectConfig,
} from "./presentation_objects.ts";

export type ScriptGenerationType = "template" | "hfa";

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

export type ModuleConfigRequirements = {
  parameters: ModuleParameter[];
};

export type HfaIndicator = {
  varName: string;
  category: string;
  definition: string;
  type: "binary" | "numeric";
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

export type ResultsObjectDefinitionJSON = {
  id: string;
  description: string;
  createTableStatementPossibleColumns?: Record<string, string>;
};

export type ValueFunc = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "identity";

export type PeriodOption = "period_id" | "quarter_id" | "year";

export type { DisaggregationOption };

export type PostAggregationExpression = {
  ingredientValues: {
    prop: string;
    func: "SUM" | "AVG";
  }[];
  expression: string;
};

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

export type MetricDefinitionJSON = {
  id: string;
  label: TranslatableString;
  variantLabel?: TranslatableString;
  valueProps: string[];
  valueFunc: ValueFunc;
  formatAs: "percent" | "number";
  periodOptions: PeriodOption[];
  requiredDisaggregationOptions: DisaggregationOption[];
  valueLabelReplacements?: Record<string, string>;
  postAggregationExpression?: PostAggregationExpression;
  resultsObjectId: string;
  aiDescription?: MetricAIDescription;
  importantNotes?: TranslatableString;
  vizPresets?: VizPreset[];
  hide?: boolean;
};

export type ModuleDefinitionJSON = {
  label: TranslatableString;
  prerequisites: string[];
  scriptGenerationType: ScriptGenerationType;
  dataSources: DataSource[];
  configRequirements: ModuleConfigRequirements;
  assetsToImport: string[];
  resultsObjects: ResultsObjectDefinitionJSON[];
  metrics: MetricDefinitionJSON[];
};

