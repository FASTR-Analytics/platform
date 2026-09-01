import type { Sql } from "postgres";
import {
  getMergedModuleConfigSelections,
  MODULE_REGISTRY,
  throwIfErrWithData,
  type ModuleConfigSelections,
  type ModuleDefinitionDetail,
  type ModuleId,
  type RunGenerationStep2Result,
} from "lib";
import { _INSTANCE_LANGUAGE } from "../../exposed_env_vars.ts";
import { getModuleDefinitionDetail } from "../../module_loader/mod.ts";
import { getHfaTimePointOrder } from "../../db/mod.ts";
import { getScriptWithParameters } from "../../server_only_funcs/get_script_with_parameters.ts";
import type { PreparedRunInputs } from "./prepare_inputs.ts";

// Stage 2 of the run pipeline — resolve (PLAN_RESULTS_RUNS item 2 / §3.7).
// Re-fetches the exact definitions the wizard's step 2 recorded (pinned
// gitRef), validates the selection is a closed DAG whose data sources are
// all in the run, freezes parameter selections, and generates each module's
// R script — the script text is an inputKey ingredient, so generation
// happens here, from the dataset captures prepare just produced.

export type ResolvedRunModule = {
  moduleId: ModuleId;
  detail: ModuleDefinitionDetail;
  gitRef: string | null;
  configSelections: ModuleConfigSelections;
  scriptText: string;
};

export async function resolveRunModules(
  mainDb: Sql,
  prepared: PreparedRunInputs,
  step2: RunGenerationStep2Result,
  countryIso3: string | undefined,
): Promise<ResolvedRunModule[]> {
  const familySet = new Set(prepared.selectedFamilies);
  const selectedIds = new Set(step2.modules.map((m) => m.moduleId));
  const scriptInputs: ScriptGenerationInputs = {
    ...prepared.scriptInputs,
    hfaTimePointOrder: await getHfaTimePointOrder(mainDb),
  };

  const resolved = new Map<string, ResolvedRunModule>();
  for (const selection of step2.modules) {
    const moduleId = selection.moduleId as ModuleId;
    const res = await getModuleDefinitionDetail(
      moduleId,
      _INSTANCE_LANGUAGE,
      step2.gitRef,
    );
    throwIfErrWithData(res);
    const detail = res.data;

    for (const prerequisite of detail.prerequisites) {
      if (!selectedIds.has(prerequisite)) {
        throw new Error(
          `Module ${moduleId} requires ${prerequisite}, which is not in the selection`,
        );
      }
    }
    for (const source of detail.dataSources) {
      if (source.sourceType === "dataset") {
        if (!familySet.has(source.datasetType)) {
          throw new Error(
            `Module ${moduleId} needs ${source.datasetType} data, which is not included in this results package`,
          );
        }
      } else if (!selectedIds.has(source.moduleId)) {
        throw new Error(
          `Module ${moduleId} reads outputs of ${source.moduleId}, which is not in the selection`,
        );
      }
    }

    const configSelections = getMergedModuleConfigSelections(
      { parameterDefinitions: [], parameterSelections: selection.parameterSelections },
      detail.configRequirements,
    );
    const scriptText = generateScript(
      detail,
      configSelections,
      countryIso3,
      scriptInputs,
    );
    resolved.set(moduleId, {
      moduleId,
      detail,
      gitRef: detail.gitRef ?? null,
      configSelections,
      scriptText,
    });
  }

  return sortByDependencies([...resolved.values()]);
}

// Kahn's algorithm over prerequisites within the selection, tie-broken by
// registry order so execution order is deterministic run to run.
function sortByDependencies(modules: ResolvedRunModule[]): ResolvedRunModule[] {
  const registryIndex = new Map(MODULE_REGISTRY.map((m, i) => [m.id, i]));
  const byRegistry = modules.toSorted(
    (a, b) =>
      (registryIndex.get(a.moduleId) ?? 0) - (registryIndex.get(b.moduleId) ?? 0),
  );
  const done = new Set<string>();
  const ordered: ResolvedRunModule[] = [];
  while (ordered.length < byRegistry.length) {
    const next = byRegistry.find(
      (m) =>
        !done.has(m.moduleId) &&
        m.detail.prerequisites.every((p) => done.has(p)),
    );
    if (next === undefined) {
      const stuck = byRegistry
        .filter((m) => !done.has(m.moduleId))
        .map((m) => m.moduleId);
      throw new Error(`Module prerequisites form a cycle: ${stuck.join(", ")}`);
    }
    done.add(next.moduleId);
    ordered.push(next);
  }
  return ordered;
}

// The script-generation inputs come from THIS run's dataset captures
// (prepare_inputs), not from project snapshot tables — under the
// no-dual-write model (Phase 3 re-cut ruling 5) nothing is written to a
// project DB, and the captured rows are by construction the ones this run's
// extracts were built from. Time-point order is instance-wide.
type ScriptGenerationInputs = PreparedRunInputs["scriptInputs"] & {
  hfaTimePointOrder: string[];
};

function generateScript(
  detail: ModuleDefinitionDetail,
  configSelections: ModuleConfigSelections,
  countryIso3: string | undefined,
  inputs: ScriptGenerationInputs,
): string {
  if (detail.scriptGenerationType === "hfa") {
    if (inputs.hfaIndicators.length === 0) {
      throw new Error(
        "No HFA indicators in the project snapshot — the HFA data prepare step did not produce indicators",
      );
    }
  }
  return getScriptWithParameters(
    detail,
    configSelections,
    countryIso3,
    "../../inputs/datasets",
    inputs.knownDatasetVariables,
    inputs.hfaIndicators,
    inputs.hfaIndicatorCode,
    inputs.hfaVariantCode,
    inputs.hfaSentinelRows,
    inputs.hfaTimePointOrder,
    inputs.commonIndicatorCatalog,
  );
}
