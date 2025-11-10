import {
  ModuleDefinition,
  type HfaIndicator,
  type ModuleConfigRequirements,
  type ModuleParameter,
  type ResultsValue,
} from "./module_definitions.ts";
import type { ModuleId } from "./module_metadata_generated.ts";

export type InstalledModuleSummary = {
  id: ModuleId;
  label: string;
  dateInstalled: string;
  configType: "none" | "parameters" | "hfa";
  //
  moduleDefinitionLabel: string;
  moduleDefinitionLastScriptUpdated: string;
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
  hfaIndicators?: { var_name: string; example_values: string }[];
};

export type ModuleDetailForRunningScript = {
  id: ModuleId;
  dateInstalled: string;
  configSelections: ModuleConfigSelections;
  //
  moduleDefinition: ModuleDefinition;
  updateAvailable: boolean;
};

export type ModuleRunStatus =
  | { status: "unrunable" }
  | { status: "runable" }
  | { status: "ready" };

export function getStartingModuleConfigSelections(
  configRequirements: ModuleConfigRequirements
): ModuleConfigSelections {
  if (configRequirements.configType === "none") {
    const cs: ModuleConfigSelectionsNone = {
      configType: "none",
    };
    return cs;
  }
  if (configRequirements.configType === "parameters") {
    const cs: ModuleConfigSelectionsParameters = {
      configType: "parameters",
      parameterDefinitions: structuredClone(configRequirements.parameters),
      parameterSelections: configRequirements.parameters.reduce<
        Record<string, string>
      >((out, obj) => {
        out[obj.replacementString] = obj.input.defaultValue;
        return out;
      }, {}),
    };
    return cs;
  }
  if (configRequirements.configType === "hfa") {
    const cs: ModuleConfigSelectionsHfa = {
      configType: "hfa",
      useSampleWeights: false,
      indicators: structuredClone(configRequirements.indicators),
    };
    return cs;
  }
  throw new Error("Bad configType for configRequirements");
}

export function getMergedModuleConfigSelections(
  oldConfigSelections: ModuleConfigSelections,
  newConfigRequirements: ModuleConfigRequirements
): ModuleConfigSelections {
  if (newConfigRequirements.configType !== oldConfigSelections.configType) {
    return getStartingModuleConfigSelections(newConfigRequirements);
  }

  if (newConfigRequirements.configType === "none") {
    return { configType: "none" };
  }

  if (
    newConfigRequirements.configType === "parameters" &&
    oldConfigSelections.configType === "parameters"
  ) {
    const mergedSelections: Record<string, string> = {};

    for (const newParam of newConfigRequirements.parameters) {
      const oldValue =
        oldConfigSelections.parameterSelections[newParam.replacementString];
      mergedSelections[newParam.replacementString] =
        oldValue !== undefined ? oldValue : newParam.input.defaultValue;
    }

    return {
      configType: "parameters",
      parameterDefinitions: structuredClone(newConfigRequirements.parameters),
      parameterSelections: mergedSelections,
    };
  }

  if (
    newConfigRequirements.configType === "hfa" &&
    oldConfigSelections.configType === "hfa"
  ) {
    return {
      configType: "hfa",
      useSampleWeights: oldConfigSelections.useSampleWeights,
      indicators: oldConfigSelections.indicators,
    };
  }

  return getStartingModuleConfigSelections(newConfigRequirements);
}

export type ModuleConfigSelections =
  | ModuleConfigSelectionsNone
  | ModuleConfigSelectionsParameters
  | ModuleConfigSelectionsHfa;

export type ModuleConfigSelectionsNone = {
  configType: "none";
};
export type ModuleConfigSelectionsParameters = {
  configType: "parameters";
  parameterDefinitions: ModuleParameter[];
  parameterSelections: Record<string, string>;
};
export type ModuleConfigSelectionsHfa = {
  configType: "hfa";
  useSampleWeights: boolean;
  indicators: HfaIndicator[];
};
