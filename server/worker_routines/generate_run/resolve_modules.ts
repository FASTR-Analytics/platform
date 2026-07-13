import type { Sql } from "postgres";
import {
  getMergedModuleConfigSelections,
  MODULE_REGISTRY,
  throwIfErrWithData,
  type CalculatedIndicator,
  type DatasetType,
  type HfaIndicator,
  type HfaIndicatorCode,
  type ModuleConfigSelections,
  type ModuleDefinitionDetail,
  type ModuleId,
  type RunGenerationStep2Result,
} from "lib";
import { _INSTANCE_LANGUAGE } from "../../exposed_env_vars.ts";
import { getModuleDefinitionDetail } from "../../module_loader/mod.ts";
import {
  getAllCalculatedIndicatorsFromSnapshot,
  getAllHfaIndicatorCodeFromSnapshot,
  getAllHfaIndicatorsFromSnapshot,
  getHfaSentinelRowsFromSnapshot,
  getHfaTimePointOrder,
} from "../../db/mod.ts";
import { getScriptWithParameters } from "../../server_only_funcs/get_script_with_parameters.ts";

// Stage 2 of the run pipeline — resolve (PLAN_RESULTS_RUNS item 2 / §3.7).
// Re-fetches the exact definitions the wizard's step 2 recorded (pinned
// gitRef), validates the selection is a closed DAG whose data sources are
// all in the run, freezes parameter selections, and generates each module's
// R script — the script text is an inputKey ingredient, so generation
// happens here, after prepare refreshed the project snapshots it reads.
// Item 2 forces every resolved node to execute; item 3 adds the base-run
// diff that turns reuse on.

export type ResolvedRunModule = {
  moduleId: ModuleId;
  detail: ModuleDefinitionDetail;
  gitRef: string | null;
  configSelections: ModuleConfigSelections;
  scriptText: string;
};

export async function resolveRunModules(
  mainDb: Sql,
  projectDb: Sql,
  selectedFamilies: DatasetType[],
  step2: RunGenerationStep2Result,
  countryIso3: string | undefined,
): Promise<ResolvedRunModule[]> {
  const familySet = new Set(selectedFamilies);
  const selectedIds = new Set(step2.modules.map((m) => m.moduleId));
  const scriptInputs = await readScriptGenerationInputs(mainDb, projectDb);

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

type ScriptGenerationInputs = {
  knownDatasetVariables: Set<string>;
  hfaIndicators: HfaIndicator[];
  hfaIndicatorCode: HfaIndicatorCode[];
  hfaSentinelRows: Awaited<ReturnType<typeof getHfaSentinelRowsFromSnapshot>>;
  hfaTimePointOrder: string[];
  calculatedIndicators: CalculatedIndicator[];
};

// The same project-snapshot reads runModuleIterator does per module —
// gathered once per generation, after prepare refreshed the snapshots, so
// every generated script is consistent with this run's extracts.
async function readScriptGenerationInputs(
  mainDb: Sql,
  projectDb: Sql,
): Promise<ScriptGenerationInputs> {
  const hfaVarRows = await projectDb<{ var_name: string }[]>`
SELECT DISTINCT var_name FROM indicators_hfa ORDER BY var_name
`;
  return {
    knownDatasetVariables: new Set(hfaVarRows.map((r) => r.var_name)),
    hfaIndicators: await getAllHfaIndicatorsFromSnapshot(projectDb),
    hfaIndicatorCode: await getAllHfaIndicatorCodeFromSnapshot(projectDb),
    hfaSentinelRows: await getHfaSentinelRowsFromSnapshot(projectDb),
    hfaTimePointOrder: await getHfaTimePointOrder(mainDb),
    calculatedIndicators: await getAllCalculatedIndicatorsFromSnapshot(projectDb),
  };
}

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
  if (detail.scriptGenerationType === "calculated_indicators") {
    if (inputs.calculatedIndicators.length === 0) {
      throw new Error(
        "No calculated indicators in the project snapshot — the HMIS data prepare step did not produce them",
      );
    }
  }
  return getScriptWithParameters(
    detail,
    configSelections,
    countryIso3,
    inputs.knownDatasetVariables,
    inputs.hfaIndicators,
    inputs.hfaIndicatorCode,
    inputs.calculatedIndicators,
    inputs.hfaSentinelRows,
    inputs.hfaTimePointOrder,
  );
}
