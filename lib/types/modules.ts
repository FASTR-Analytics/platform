import {
  type ModuleConfigRequirements,
  type ModuleParameter,
  type ModuleDefinitionInstalled,
} from "./_module_definition_installed.ts";
import {
  type Metric,
  type PeriodOption,
  type VizPreset,
  type MetricAIDescription,
  type ValueFunc,
  type PostAggregationExpression,
} from "./_metric_installed.ts";
import { t3 } from "../translate/mod.ts";

export type ModuleDefinitionDetail = ModuleDefinitionInstalled & {
  metrics: Metric[];
};
import type { DirtyOrRunStatus } from "./project_dirty_states.ts";
import type { ModuleId } from "./module_registry.ts";
import type { DisaggregationOption, PresentationOption } from "./presentation_objects.ts";

// Re-export types from _metric_installed.ts for convenience
export type { ValueFunc, PostAggregationExpression };

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

export type InstalledModuleSummary = {
  id: ModuleId;
  label: string;
  dirty: DirtyOrRunStatus;
  hasParameters: boolean;
  installedAt: string;
  computeUpdatedAt?: string;
  definitionUpdatedAt?: string;
  configUpdatedAt?: string;
  lastRunAt: string;
  installedGitRef?: string;
  computeGitRef?: string;
  lastRunGitRef?: string;
  moduleDefinitionResultsObjectIds: string[];
};

export type InstalledModuleWithResultsValues = {
  id: ModuleId;
  label: string;
  resultsValues: ResultsValue[];
};

export type InstalledModuleWithConfigSelections = {
  id: ModuleId;
  label: string;
  configSelections: ModuleConfigSelections;
};

export type ModuleDetailForRunningScript = {
  id: ModuleId;
  installedAt: string;
  configSelections: ModuleConfigSelections;
  moduleDefinition: ModuleDefinitionInstalled;
};

export type ModuleRunStatus =
  | { status: "unrunable" }
  | { status: "runable" }
  | { status: "ready" };

export function getStartingModuleConfigSelections(
  configRequirements: ModuleConfigRequirements
): ModuleConfigSelections {
  return {
    parameterDefinitions: structuredClone(configRequirements.parameters),
    parameterSelections: configRequirements.parameters.reduce<
      Record<string, string>
    >((out, obj) => {
      out[obj.replacementString] = obj.input.defaultValue;
      return out;
    }, {}),
  };
}

export function getMergedModuleConfigSelections(
  oldConfigSelections: ModuleConfigSelections,
  newConfigRequirements: ModuleConfigRequirements
): ModuleConfigSelections {
  const mergedSelections: Record<string, string> = {};

  for (const newParam of newConfigRequirements.parameters) {
    const oldValue =
      oldConfigSelections.parameterSelections[newParam.replacementString];
    mergedSelections[newParam.replacementString] =
      oldValue !== undefined ? oldValue : newParam.input.defaultValue;
  }

  return {
    parameterDefinitions: structuredClone(newConfigRequirements.parameters),
    parameterSelections: mergedSelections,
  };
}

export type ModuleConfigSelections = {
  parameterDefinitions: ModuleParameter[];
  parameterSelections: Record<string, string>;
};

export type ModuleLatestCommit = {
  moduleId: ModuleId;
  latestCommit: {
    sha: string;
    message: string;
    date: string;
    author: string;
  };
};

export type DefinitionChanges = {
  script: boolean;
  configRequirements: boolean;
  resultsObjects: boolean;
  metrics: boolean;
  vizPresets: boolean;
  label: boolean;
  dataSources: boolean;
  assetsToImport: boolean;
};

export type ModuleUpdatePreview = {
  hasUpdate: boolean;
  currentGitRef: string | null;
  incomingGitRef: string;
  changes: DefinitionChanges;
  recommendsRerun: boolean;
  commitsSince: { sha: string; message: string; date: string; author: string }[];
};

export type CompareProjectsModuleParameter = {
  replacementString: string;
  description: string;
  value: string;
};

export type CompareProjectsModule = {
  id: string;
  dirty: "queued" | "ready" | "error";
  installedAt: string;
  installedGitRef?: string;
  lastRunAt: string;
  lastRunGitRef?: string;
  parameters: CompareProjectsModuleParameter[];
};

export type CompareProjectsData = {
  projects: {
    id: string;
    label: string;
    modules: CompareProjectsModule[];
  }[];
};

export function get_PERIOD_OPTION_MAP(): Record<PeriodOption, string> {
  return {
    period_id: t3({ en: "Monthly", fr: "Mensuel" }),
    quarter_id: t3({ en: "Quarterly", fr: "Trimestriel" }),
    year: t3({ en: "Yearly", fr: "Annuellement" }),
  };
}
