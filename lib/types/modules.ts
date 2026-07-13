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
  // The results table has a facility_id column, i.e. rows are raw facility
  // observations rather than pre-aggregated area/national summaries. Derived
  // at enrichment time; optional because cached payloads may predate the
  // field (absence reads as false). Drives admin-area roll-up eligibility
  // for AVG metrics (isRollupEligibleResultsValue).
  hasFacilityLevelRows?: boolean;
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

// Status comes from the attached run's finalize-computed availability stamps
// (PLAN_RESULTS_RUNS §2.2) — readers never re-derive availability.
export type MetricStatus = "ready" | "unavailable";

export type MetricWithStatus = ResultsValue & {
  status: MetricStatus;
  statusReason?: string;
  moduleId: ModuleId;
  vizPresets?: VizPreset[];
};

// The attached run's module catalog entry as the client sees it (built from
// the run manifest — no live project-DB state).
export type InstalledModuleSummary = {
  id: ModuleId;
  label: string;
  hasParameters: boolean;
  lastRunAt: string | null;
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

export type CompareProjectsModuleParameter = {
  replacementString: string;
  description: string;
  value: string;
};

export type CompareProjectsModule = {
  id: string;
  dirty: "queued" | "ready" | "error";
  computeDefUpdatedAt?: string;
  computeDefGitRef?: string;
  presentationDefUpdatedAt?: string;
  presentationDefGitRef?: string;
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
    period_id: t3({ en: "Monthly", fr: "Mensuel", pt: "Mensal" }),
    quarter_id: t3({ en: "Quarterly", fr: "Trimestriel", pt: "Trimestral" }),
    year: t3({ en: "Yearly", fr: "Annuellement", pt: "Anual" }),
  };
}
