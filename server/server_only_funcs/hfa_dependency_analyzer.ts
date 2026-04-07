import type { HfaIndicator, HfaIndicatorCode } from "lib";

const R_KEYWORDS = new Set([
  "TRUE",
  "FALSE",
  "NA",
  "NA_real_",
  "NA_integer_",
  "NA_character_",
  "NULL",
  "Inf",
  "NaN",
  "if",
  "else",
  "for",
  "while",
  "repeat",
  "function",
  "break",
  "next",
  "return",
  "in",
]);

const R_COMMON_FUNCTIONS = new Set([
  "c",
  "case_when",
  "across",
  "rowSums",
  "rowMeans",
  "str_detect",
  "as",
  "as.numeric",
  "as.character",
  "as.integer",
  "as.logical",
  "is",
  "is.na",
  "is.null",
  "ifelse",
  "sum",
  "mean",
  "min",
  "max",
  "abs",
  "sqrt",
  "log",
  "exp",
]);

export function extractVariablesFromRCode(rCode: string): string[] {
  let cleaned = rCode;

  cleaned = cleaned.replace(/"[^"]*"/g, "");
  cleaned = cleaned.replace(/'[^']*'/g, "");

  const identifierPattern = /\b[a-zA-Z_][a-zA-Z0-9._]*\b/g;
  const matches = [...cleaned.matchAll(identifierPattern)];

  const variables = matches
    .map((m) => m[0])
    .filter((v) => !R_KEYWORDS.has(v) && !R_COMMON_FUNCTIONS.has(v));

  return [...new Set(variables)].sort();
}

export type ExtractedDependencies = {
  qids: string[];
  dependencies: string[];
  unknownVariables: string[];
};

export function extractDependenciesFromCode(
  rCode: string,
  rFilterCode: string | undefined,
  allIndicatorVarNames: Set<string>,
  knownDatasetVariables: Set<string>,
): ExtractedDependencies {
  const allVariables = new Set<string>();

  const rCodeTrimmed = rCode.trim();
  if (rCodeTrimmed) {
    extractVariablesFromRCode(rCodeTrimmed).forEach((v) => allVariables.add(v));
  }

  const rFilterTrimmed = rFilterCode?.trim() ?? "";
  if (rFilterTrimmed) {
    extractVariablesFromRCode(rFilterTrimmed).forEach((v) =>
      allVariables.add(v)
    );
  }

  const qids: string[] = [];
  const dependencies: string[] = [];
  const unknownVariables: string[] = [];

  for (const variable of allVariables) {
    if (allIndicatorVarNames.has(variable)) {
      dependencies.push(variable);
    } else if (knownDatasetVariables.has(variable)) {
      qids.push(variable);
    } else {
      unknownVariables.push(variable);
    }
  }

  return {
    qids: qids.sort(),
    dependencies: dependencies.sort(),
    unknownVariables: unknownVariables.sort(),
  };
}

export function buildUnionDependencyGraph(
  indicators: HfaIndicator[],
  codeByIndicator: Map<string, HfaIndicatorCode[]>,
  allIndicatorVarNames: Set<string>,
  knownDatasetVariables: Set<string>,
): {
  graph: Map<string, string[]>;
  dependenciesMap: Map<string, string[]>;
  validationErrors: string[];
} {
  const graph = new Map<string, string[]>();
  const dependenciesMap = new Map<string, string[]>();
  const validationErrors: string[] = [];

  for (const indicator of indicators) {
    graph.set(indicator.varName, []);
    const unionDeps = new Set<string>();

    const codeSnippets = codeByIndicator.get(indicator.varName) ?? [];
    for (const snippet of codeSnippets) {
      if (!snippet.rCode || snippet.rCode.trim() === "") continue;

      const deps = extractDependenciesFromCode(
        snippet.rCode,
        snippet.rFilterCode,
        allIndicatorVarNames,
        knownDatasetVariables,
      );

      if (deps.unknownVariables.length > 0) {
        validationErrors.push(
          `Indicator "${indicator.varName}" (time_point "${snippet.timePoint}"): Unknown variables [${deps.unknownVariables.join(", ")}].`,
        );
      }

      deps.dependencies.forEach((d) => unionDeps.add(d));
    }

    dependenciesMap.set(indicator.varName, [...unionDeps].sort());
  }

  for (const [varName, dependencies] of dependenciesMap.entries()) {
    for (const dep of dependencies) {
      if (!graph.has(dep)) {
        graph.set(dep, []);
      }
      graph.get(dep)!.push(varName);
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
    indicatorMap.set(indicator.varName, indicator);
  }

  const inDegree = new Map<string, number>();
  for (const indicator of indicators) {
    const deps = dependenciesMap.get(indicator.varName) || [];
    inDegree.set(indicator.varName, deps.length);
  }

  const queue: string[] = [];
  for (const [varName, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(varName);
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
      (ind) => !ordered.find((o) => o.varName === ind.varName),
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

  function dfs(varName: string, path: string[]): void {
    visited.add(varName);
    recStack.add(varName);
    path.push(varName);

    const dependencies = dependenciesMap.get(varName) || [];
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

    recStack.delete(varName);
  }

  for (const indicator of indicators) {
    if (!visited.has(indicator.varName)) {
      dfs(indicator.varName, []);
    }
  }

  return cycles;
}

export function formatCycles(cycles: string[][]): string {
  return cycles.map((cycle) => cycle.join(" → ")).join("\n");
}
