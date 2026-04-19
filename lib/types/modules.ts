import {
  ModuleDefinition,
  type ModuleConfigRequirements,
  type ModuleParameter,
  type ResultsValue,
} from "./module_definition.ts";
import type { DirtyOrRunStatus } from "./project_dirty_states.ts";
import type { ModuleId } from "./module_registry.ts";

export type InstalledModuleSummary = {
  id: ModuleId;
  label: string;
  dirty: DirtyOrRunStatus;
  hasParameters: boolean;
  installedAt: string;
  scriptUpdatedAt?: string;
  definitionUpdatedAt?: string;
  configUpdatedAt?: string;
  lastRunAt: string;
  installedGitRef?: string;
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
  moduleDefinition: ModuleDefinition;
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

export type ModuleUpdatePreview = {
  impactType: "script_change" | "definition_only" | "no_change";
  commitsSince: { sha: string; message: string; date: string; author: string }[];
  headGitRef: string;
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
