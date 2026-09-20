import { extractRIdentifiers, type HfaIndicator, type HfaIndicatorCode } from "lib";

export type ExtractedDependencies = {
  // Dataset variable ids. `variableIds` is the union across rCode +
  // rFilterCode (used by the value/missingness expression);
  // `codeVariableIds` and `filterVariableIds` split it by source so the
  // response-status expression can decide applicability (filter variables)
  // separately from answer status (code variables).
  variableIds: string[];
  codeVariableIds: string[];
  filterVariableIds: string[];
  dependencies: string[];
  unknownVariables: string[];
};

export function extractDependenciesFromCode(
  rCode: string,
  rFilterCode: string | undefined,
  allIndicatorIds: Set<string>,
  knownVariableIds: Set<string>,
): ExtractedDependencies {
  const codeVars = new Set<string>();
  const filterVars = new Set<string>();

  const rCodeTrimmed = rCode.trim();
  if (rCodeTrimmed) {
    extractRIdentifiers(rCodeTrimmed).forEach((v) => codeVars.add(v));
  }

  const rFilterTrimmed = rFilterCode?.trim() ?? "";
  if (rFilterTrimmed) {
    extractRIdentifiers(rFilterTrimmed).forEach((v) => filterVars.add(v));
  }

  const variableIds = new Set<string>();
  const codeVariableIds: string[] = [];
  const filterVariableIds: string[] = [];
  const dependencies = new Set<string>();
  const unknownVariables = new Set<string>();

  const classify = (variable: string, source: "code" | "filter"): void => {
    if (allIndicatorIds.has(variable)) {
      dependencies.add(variable);
    } else if (knownVariableIds.has(variable)) {
      variableIds.add(variable);
      if (source === "code") {
        codeVariableIds.push(variable);
      } else {
        filterVariableIds.push(variable);
      }
    } else {
      unknownVariables.add(variable);
    }
  };

  codeVars.forEach((v) => classify(v, "code"));
  filterVars.forEach((v) => classify(v, "filter"));

  return {
    variableIds: [...variableIds].sort(),
    codeVariableIds: codeVariableIds.sort(),
    filterVariableIds: filterVariableIds.sort(),
    dependencies: [...dependencies].sort(),
    unknownVariables: [...unknownVariables].sort(),
  };
}

export function buildUnionDependencyGraph(
  indicators: HfaIndicator[],
  codeByIndicator: Map<string, HfaIndicatorCode[]>,
  allIndicatorIds: Set<string>,
  knownVariableIds: Set<string>,
): {
  graph: Map<string, string[]>;
  dependenciesMap: Map<string, string[]>;
  validationErrors: string[];
} {
  const graph = new Map<string, string[]>();
  const dependenciesMap = new Map<string, string[]>();
  const validationErrors: string[] = [];

  for (const indicator of indicators) {
    graph.set(indicator.indicatorId, []);
    const unionDeps = new Set<string>();

    const codeSnippets = codeByIndicator.get(indicator.indicatorId) ?? [];
    for (const snippet of codeSnippets) {
      if (!snippet.rCode || snippet.rCode.trim() === "") continue;

      const deps = extractDependenciesFromCode(
        snippet.rCode,
        snippet.rFilterCode,
        allIndicatorIds,
        knownVariableIds,
      );

      if (deps.unknownVariables.length > 0) {
        validationErrors.push(
          `Indicator "${indicator.indicatorId}" (time_point "${snippet.timePoint}"): Unknown variables [${deps.unknownVariables.join(", ")}].`,
        );
      }

      deps.dependencies.forEach((d) => unionDeps.add(d));
    }

    dependenciesMap.set(indicator.indicatorId, [...unionDeps].sort());
  }

  for (const [indicatorId, dependencies] of dependenciesMap.entries()) {
    for (const dep of dependencies) {
      if (!graph.has(dep)) {
        graph.set(dep, []);
      }
      graph.get(dep)!.push(indicatorId);
    }
  }

  return { graph, dependenciesMap, validationErrors };
}

type TopologicalSortResult = {
  ordered: HfaIndicator[];
  cycles: string[][];
};

export function topologicalSort(
  indicators: HfaIndicator[],
  graphResult: {
    graph: Map<string, string[]>;
    dependenciesMap: Map<string, string[]>;
  },
): TopologicalSortResult {
  const { graph, dependenciesMap } = graphResult;
  const indicatorMap = new Map<string, HfaIndicator>();
  for (const indicator of indicators) {
    indicatorMap.set(indicator.indicatorId, indicator);
  }

  const inDegree = new Map<string, number>();
  for (const indicator of indicators) {
    const deps = dependenciesMap.get(indicator.indicatorId) || [];
    inDegree.set(indicator.indicatorId, deps.length);
  }

  const queue: string[] = [];
  for (const [indicatorId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(indicatorId);
    }
  }

  const ordered: HfaIndicator[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const indicator = indicatorMap.get(current);
    if (indicator) {
      ordered.push(indicator);
    }

    const dependents = graph.get(current) || [];
    for (const dependent of dependents) {
      const newDegree = (inDegree.get(dependent) || 0) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  if (ordered.length !== indicators.length) {
    const remaining = indicators.filter(
      (ind) => !ordered.find((o) => o.indicatorId === ind.indicatorId),
    );
    const cycles = detectCycles(remaining, dependenciesMap);
    return { ordered: [], cycles };
  }

  return { ordered, cycles: [] };
}

function detectCycles(
  indicators: HfaIndicator[],
  dependenciesMap: Map<string, string[]>,
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(indicatorId: string, path: string[]): void {
    visited.add(indicatorId);
    recStack.add(indicatorId);
    path.push(indicatorId);

    const dependencies = dependenciesMap.get(indicatorId) || [];
    for (const dep of dependencies) {
      if (!visited.has(dep)) {
        dfs(dep, [...path]);
      } else if (recStack.has(dep)) {
        const cycleStart = path.indexOf(dep);
        if (cycleStart >= 0) {
          cycles.push([...path.slice(cycleStart), dep]);
        }
      }
    }

    recStack.delete(indicatorId);
  }

  for (const indicator of indicators) {
    if (!visited.has(indicator.indicatorId)) {
      dfs(indicator.indicatorId, []);
    }
  }

  return cycles;
}

export function formatCycles(cycles: string[][]): string {
  return cycles.map((cycle) => cycle.join(" → ")).join("\n");
}
