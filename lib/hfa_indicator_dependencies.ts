// The dependency analysis over parsed HFA code: per snippet the variables and
// indicators it names, and across indicators the graph the generator sorts.
// The generator and the status core read this one analysis, so a cycle the
// editor reports is the cycle a run refuses. Pure: this compiles into Deno and
// Vite.

import {
  describeHfaCodeError,
  type HfaCodeParse,
  parseHfaIndicatorCode,
} from "./hfa_indicator_code.ts";
import type { ExpressionNode } from "./indicator_expression/mod.ts";
import type { HfaIndicator, HfaIndicatorCode } from "./types/mod.ts";

export type ExtractedDependencies = {
  // Dataset variable ids. `variableIds` is the union across code + filter
  // code (used by the value/missingness expression);
  // `codeVariableIds` and `filterVariableIds` split it by source so the
  // response-status expression can decide applicability (filter variables)
  // separately from answer status (code variables).
  variableIds: string[];
  codeVariableIds: string[];
  filterVariableIds: string[];
  dependencies: string[];
  unknownVariables: string[];
};

// One snippet parsed once per generation: its code and optional filter as
// ASTs, or the reason it cannot run.
export type SnippetAnalysis =
  | {
    ok: true;
    code: ExpressionNode;
    filter: ExpressionNode | undefined;
    deps: ExtractedDependencies;
  }
  | { ok: false; problem: string };

export type AnalyseSnippet = (snippet: HfaIndicatorCode) => SnippetAnalysis;

// Memoised by snippet object, so the graph pass, its rebuild and the emit
// pass share one parse. `parse` lets a caller share a parse cache across
// passes, as the status core does.
export function createSnippetAnalyser(
  allIndicatorIds: Set<string>,
  knownVariableIds: Set<string>,
  parse: (source: string) => HfaCodeParse = parseHfaIndicatorCode,
): AnalyseSnippet {
  const cache = new Map<HfaIndicatorCode, SnippetAnalysis>();
  return (snippet) => {
    const cached = cache.get(snippet);
    if (cached !== undefined) return cached;
    const analysis = analyseSnippet(
      snippet,
      allIndicatorIds,
      knownVariableIds,
      parse,
    );
    cache.set(snippet, analysis);
    return analysis;
  };
}

function analyseSnippet(
  snippet: HfaIndicatorCode,
  allIndicatorIds: Set<string>,
  knownVariableIds: Set<string>,
  parse: (source: string) => HfaCodeParse,
): SnippetAnalysis {
  const code = parse(snippet.code.trim());
  if (!code.ok) {
    return {
      ok: false,
      problem: `Code does not parse: ${describeHfaCodeError(code.error).en}`,
    };
  }
  const filterSource = snippet.filterCode?.trim() ?? "";
  const filter = filterSource ? parse(filterSource) : undefined;
  if (filter !== undefined && !filter.ok) {
    return {
      ok: false,
      problem: `Filter does not parse: ${
        describeHfaCodeError(filter.error).en
      }`,
    };
  }
  return {
    ok: true,
    code: code.node,
    filter: filter?.node,
    deps: classifyIdentifiers(
      code.identifiers,
      filter?.identifiers ?? [],
      allIndicatorIds,
      knownVariableIds,
    ),
  };
}

function classifyIdentifiers(
  codeIdentifiers: string[],
  filterIdentifiers: string[],
  allIndicatorIds: Set<string>,
  knownVariableIds: Set<string>,
): ExtractedDependencies {
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

  codeIdentifiers.forEach((v) => classify(v, "code"));
  filterIdentifiers.forEach((v) => classify(v, "filter"));

  return {
    variableIds: [...variableIds].sort(),
    codeVariableIds: codeVariableIds.sort(),
    filterVariableIds: filterVariableIds.sort(),
    dependencies: [...dependencies].sort(),
    unknownVariables: [...unknownVariables].sort(),
  };
}

// Why a snippet cannot run, or nothing: a parse failure, or names that are
// neither a variable of the round nor an indicator.
export function snippetProblems(analysis: SnippetAnalysis): string[] {
  if (!analysis.ok) return [analysis.problem];
  return analysis.deps.unknownVariables.length > 0
    ? [`Unknown variables [${analysis.deps.unknownVariables.join(", ")}]`]
    : [];
}

export function buildUnionDependencyGraph(
  indicators: HfaIndicator[],
  codeByIndicator: Map<string, HfaIndicatorCode[]>,
  analyse: AnalyseSnippet,
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
      if (!snippet.code || snippet.code.trim() === "") continue;

      const analysis = analyse(snippet);
      for (const problem of snippetProblems(analysis)) {
        validationErrors.push(
          `Indicator "${indicator.indicatorId}" (time_point "${snippet.timePoint}"): ${problem}.`,
        );
      }
      if (analysis.ok) {
        analysis.deps.dependencies.forEach((d) => unionDeps.add(d));
      }
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

// Every cycle of the main-code dependency graph the generator sorts, as the
// sorted members of each strongly connected component (an indicator naming
// itself is a cycle of one). Unlike `topologicalSort`'s cycle paths, every
// indicator on a cycle is in exactly one of these.
export function findHfaDependencyCycles(
  indicators: HfaIndicator[],
  codeByIndicator: Map<string, HfaIndicatorCode[]>,
  analyse: AnalyseSnippet,
): string[][] {
  const { dependenciesMap } = buildUnionDependencyGraph(
    indicators,
    codeByIndicator,
    analyse,
  );
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  const visit = (id: string): void => {
    index.set(id, index.size);
    lowLink.set(id, index.get(id)!);
    stack.push(id);
    onStack.add(id);
    for (const dep of dependenciesMap.get(id) ?? []) {
      if (!index.has(dep)) {
        visit(dep);
        lowLink.set(id, Math.min(lowLink.get(id)!, lowLink.get(dep)!));
      } else if (onStack.has(dep)) {
        lowLink.set(id, Math.min(lowLink.get(id)!, index.get(dep)!));
      }
    }
    if (lowLink.get(id) !== index.get(id)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== id);
    if (
      component.length > 1 || (dependenciesMap.get(id) ?? []).includes(id)
    ) {
      cycles.push(component.sort());
    }
  };
  for (const id of dependenciesMap.keys()) {
    if (!index.has(id)) visit(id);
  }
  return cycles;
}
