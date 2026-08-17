import type {
  DatasetType,
  ModuleId,
  RunGenerationModuleOption,
  RunGenerationModuleOptions,
  RunGenerationStep1Result,
} from "lib";

// Dependency closure (self + prerequisites + results-object source modules,
// transitive), mirroring the resolve-stage validation. A dependency missing
// from the options (e.g. country-filtered) leaves the closure incomplete —
// an incomplete closure marks the module unofferable.
export type ModuleGraph = {
  optionById: Map<ModuleId, RunGenerationModuleOption>;
  closures: Map<ModuleId, { ids: Set<ModuleId>; complete: boolean }>;
};

export function buildModuleGraph(
  options: RunGenerationModuleOptions,
): ModuleGraph {
  const optionById = new Map(options.modules.map((o) => [o.id, o]));
  function closureOf(id: ModuleId): { ids: Set<ModuleId>; complete: boolean } {
    const ids = new Set<ModuleId>();
    let complete = true;
    const queue: ModuleId[] = [id];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (ids.has(current)) {
        continue;
      }
      const option = optionById.get(current);
      if (option === undefined) {
        complete = false;
        continue;
      }
      ids.add(current);
      queue.push(...option.prerequisites, ...option.moduleDependencies);
    }
    return { ids, complete };
  }
  return {
    optionById,
    closures: new Map(options.modules.map((o) => [o.id, closureOf(o.id)])),
  };
}

export function familiesOf(step1: RunGenerationStep1Result): Set<DatasetType> {
  return new Set<DatasetType>([
    ...(step1.hmis ? (["hmis"] as const) : []),
    ...(step1.hfa ? (["hfa"] as const) : []),
    ...(step1.iceh ? (["iceh"] as const) : []),
  ]);
}

export function missingFamiliesFor(
  graph: ModuleGraph,
  id: ModuleId,
  families: Set<DatasetType>,
): DatasetType[] {
  const closure = graph.closures.get(id);
  if (closure === undefined) {
    return [];
  }
  const missing = new Set<DatasetType>();
  for (const memberId of closure.ids) {
    for (const datasetType of graph.optionById.get(memberId)!.datasetTypes) {
      if (!families.has(datasetType)) {
        missing.add(datasetType);
      }
    }
  }
  return [...missing];
}

// Offerable = known, closure complete, and every closure member's data
// families are among those chosen in step 1.
export function isOfferable(
  graph: ModuleGraph,
  id: ModuleId,
  families: Set<DatasetType>,
): boolean {
  const closure = graph.closures.get(id);
  return closure !== undefined && closure.complete &&
    missingFamiliesFor(graph, id, families).length === 0;
}
