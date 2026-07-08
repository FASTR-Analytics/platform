import type {
  HfaIndicator,
  HfaIndicatorCode,
  ModuleConfigSelections,
  ModuleDefinitionInstalled,
} from "lib";
import { serialiseMultiMembershipValues } from "lib";
import {
  extractDependenciesFromCode,
  buildUnionDependencyGraph,
  topologicalSort,
  formatCycles,
} from "./hfa_dependency_analyzer.ts";

// Per-variable sentinel classification captured at import time
// (PLAN_HFA_FEATURES.md), propagated to the project snapshot and
// consumed here. A variable absent from the map falls back to the hardcoded
// Sierra-Leone set, so un-reclassified snapshots keep working.
export type HfaSentinelRow = {
  varName: string;
  value: string;
  sentinelClass: string;
  isNumeric: boolean;
};

type VarSentinels = {
  // Select-list don't-know: missing unless DK-as-No (binary); "dont_know" status.
  dontKnowSelect: string[];
  // Numeric don't-know (-999999): missing regardless of policy; "dont_know" status.
  dontKnowNumeric: string[];
  // Refusal: always missing; "missing" status (a distinct % refused is layer 4).
  refused: string[];
};

function buildSentinelMap(rows: HfaSentinelRow[]): Map<string, VarSentinels> {
  const map = new Map<string, VarSentinels>();
  for (const r of rows) {
    let entry = map.get(r.varName);
    if (!entry) {
      entry = { dontKnowSelect: [], dontKnowNumeric: [], refused: [] };
      map.set(r.varName, entry);
    }
    if (r.sentinelClass === "refused") {
      entry.refused.push(r.value);
    } else if (r.sentinelClass === "dont_know") {
      const bucket = r.isNumeric ? entry.dontKnowNumeric : entry.dontKnowSelect;
      bucket.push(r.value);
    }
    // other / not_applicable / question_specific are substantive (principle 5).
  }
  return map;
}

// R membership fragment for a set of codes: "== -999999" / "%in% c(-99, ...)".
// Empty set → undefined so the caller drops the term entirely.
function rMembership(codes: string[]): string | undefined {
  if (codes.length === 0) return undefined;
  if (codes.length === 1) return `== ${codes[0]}`;
  return `%in% c(${codes.join(", ")})`;
}

// -999999 (numeric don't-know) is always missing; select don't-know (-99) is
// missing unless the DONT_KNOW_TREATMENT parameter says to treat it as "No"
// for binary indicators, in which case it falls through to the indicator's
// positive test and fails it item-by-item (see PLAN_HFA_FEATURES.md).
function generateMissingnessCheck(
  qids: string[],
  includeDontKnow: boolean,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const missingChecks = qids.map((varName) => {
    const entry = sentinelMap.get(varName);
    let codes: string[];
    if (entry) {
      codes = [
        ...entry.dontKnowNumeric,
        ...entry.refused,
        ...(includeDontKnow ? entry.dontKnowSelect : []),
      ];
    } else {
      codes = includeDontKnow ? ["-99", "-999999"] : ["-999999"];
    }
    const membership = rMembership(codes);
    return membership
      ? `is.na(${varName}) | ${varName} ${membership}`
      : `is.na(${varName})`;
  });

  if (missingChecks.length === 0) {
    return "FALSE";
  } else if (missingChecks.length === 1) {
    return missingChecks[0];
  } else {
    return missingChecks.join(" | ");
  }
}

// Response-status per-qid checks (policy-independent classification). Fall back
// to the hardcoded set when a variable is unclassified.
function statusDontKnowCheck(
  qid: string,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const entry = sentinelMap.get(qid);
  const codes = entry
    ? [...entry.dontKnowSelect, ...entry.dontKnowNumeric]
    : ["-99", "-999999"];
  const membership = rMembership(codes);
  return membership ? `${qid} ${membership}` : "FALSE";
}

function statusMissingCheck(
  qid: string,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const entry = sentinelMap.get(qid);
  const refusedMembership = entry ? rMembership(entry.refused) : undefined;
  return refusedMembership
    ? `is.na(${qid}) | ${qid} ${refusedMembership}`
    : `is.na(${qid})`;
}

function statusFilterUnknownCheck(
  qid: string,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const entry = sentinelMap.get(qid);
  const codes = entry
    ? [...entry.dontKnowSelect, ...entry.dontKnowNumeric, ...entry.refused]
    : ["-99", "-999999"];
  const membership = rMembership(codes);
  return membership ? `is.na(${qid}) | ${qid} ${membership}` : `is.na(${qid})`;
}

function buildPerTimePointMutateExpression(
  indicator: HfaIndicator,
  codeSnippets: HfaIndicatorCode[],
  allIndicatorVarNames: Set<string>,
  knownDatasetVariables: Set<string>,
  dontKnowAsNo: boolean,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const timePointBranches: string[] = [];
  const includeDontKnow = indicator.type === "numeric" || !dontKnowAsNo;

  for (const snippet of codeSnippets) {
    const rCode = snippet.rCode.trim();
    if (!rCode) continue;

    const timePoint = snippet.timePoint.replace(/"/g, '\\"');

    const rFilterCode = snippet.rFilterCode?.trim() ?? "";
    const deps = extractDependenciesFromCode(
      rCode,
      snippet.rFilterCode,
      allIndicatorVarNames,
      knownDatasetVariables,
    );
    const missingnessCheck = generateMissingnessCheck(
      deps.qids,
      includeDontKnow,
      sentinelMap,
    );

    if (indicator.type === "numeric") {
      if (rFilterCode) {
        timePointBranches.push(
          `    time_point == "${timePoint}" & (${missingnessCheck}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${timePoint}" & !(${rFilterCode}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${timePoint}" ~ ${rCode}`,
        );
      } else {
        timePointBranches.push(
          `    time_point == "${timePoint}" & (${missingnessCheck}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${timePoint}" ~ ${rCode}`,
        );
      }
    } else {
      if (rFilterCode) {
        timePointBranches.push(
          `    time_point == "${timePoint}" & (${missingnessCheck}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${timePoint}" & !(${rFilterCode}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${timePoint}" & (${rCode}) ~ 1`,
        );
        timePointBranches.push(
          `    time_point == "${timePoint}" ~ 0`,
        );
      } else {
        timePointBranches.push(
          `    time_point == "${timePoint}" & (${missingnessCheck}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${timePoint}" & (${rCode}) ~ 1`,
        );
        timePointBranches.push(
          `    time_point == "${timePoint}" ~ 0`,
        );
      }
    }
  }

  timePointBranches.push("    TRUE ~ NA_real_");

  return `case_when(\n${timePointBranches.join(",\n")}\n  )`;
}

// Response-status companion to the value expression: classifies each
// facility × time_point as dont_know / missing / not_applicable / answered,
// independent of the DONT_KNOW_TREATMENT policy. Consumed by the
// M10_hfa_response_status.csv results object (PLAN_HFA_FEATURES.md).
function buildPerTimePointStatusExpression(
  codeSnippets: HfaIndicatorCode[],
  allIndicatorVarNames: Set<string>,
  knownDatasetVariables: Set<string>,
  sentinelMap: Map<string, VarSentinels>,
): string {
  const branches: string[] = [];

  for (const snippet of codeSnippets) {
    const rCode = snippet.rCode.trim();
    if (!rCode) continue;

    const timePoint = snippet.timePoint.replace(/"/g, '\\"');
    const rFilterCode = snippet.rFilterCode?.trim() ?? "";
    const deps = extractDependenciesFromCode(
      rCode,
      snippet.rFilterCode,
      allIndicatorVarNames,
      knownDatasetVariables,
    );

    // Applicability is decided first, over the filter variables only: a facility
    // is not_applicable when the filter is false, or when a filter variable is
    // itself unknown (NA / don't-know) so eligibility can't be confirmed. Only
    // among applicable facilities do we classify the answer, using the code
    // variables only — otherwise a filtered-out facility whose (never-asked)
    // question variable is NA would be mislabelled "missing" before the
    // not_applicable branch is reached.
    const dkCheck = deps.codeQids.length > 0
      ? deps.codeQids.map((q) => statusDontKnowCheck(q, sentinelMap)).join(" | ")
      : "FALSE";
    const naCheck = deps.codeQids.length > 0
      ? deps.codeQids.map((q) => statusMissingCheck(q, sentinelMap)).join(" | ")
      : "FALSE";

    if (rFilterCode) {
      const filterUnknownChecks = deps.filterQids.map((q) =>
        statusFilterUnknownCheck(q, sentinelMap)
      );
      const notApplicableCheck = [`!(${rFilterCode})`, ...filterUnknownChecks]
        .join(" | ");
      branches.push(
        `    time_point == "${timePoint}" & (${notApplicableCheck}) ~ "not_applicable"`,
      );
    }
    branches.push(
      `    time_point == "${timePoint}" & (${dkCheck}) ~ "dont_know"`,
    );
    branches.push(
      `    time_point == "${timePoint}" & (${naCheck}) ~ "missing"`,
    );
    branches.push(`    time_point == "${timePoint}" ~ "answered"`);
  }

  branches.push("    TRUE ~ NA_character_");

  return `case_when(\n${branches.join(",\n")}\n  )`;
}

export function getScriptWithParametersHfa(
  moduleDefinition: ModuleDefinitionInstalled,
  configSelections: ModuleConfigSelections,
  countryIso3: string | undefined,
  indicators: HfaIndicator[],
  indicatorCode: HfaIndicatorCode[],
  knownDatasetVariables: Set<string>,
  sentinelRows: HfaSentinelRow[],
  hfaTimePointOrder: string[],
): string {
  const sentinelMap = buildSentinelMap(sentinelRows);

  const stopIfIndicatorFails =
    configSelections.parameterSelections["STOP_IF_INDICATOR_FAILS"]?.trim() !==
      "FALSE";

  const dontKnowAsNo =
    configSelections.parameterSelections["DONT_KNOW_TREATMENT"]?.trim() ===
      "no";

  const allIndicatorVarNames = new Set(indicators.map((ind) => ind.varName));

  // Group code by indicator
  const codeByIndicator = new Map<string, HfaIndicatorCode[]>();
  for (const code of indicatorCode) {
    if (!codeByIndicator.has(code.varName)) {
      codeByIndicator.set(code.varName, []);
    }
    codeByIndicator.get(code.varName)!.push(code);
  }

  // Track skipped indicators and warnings
  const skippedIndicators = new Set<string>();
  const warnings: string[] = [];

  // Filter out indicators without R code
  let filteredIndicators = indicators;
  if (!stopIfIndicatorFails) {
    filteredIndicators = indicators.filter((indicator) => {
      const snippets = codeByIndicator.get(indicator.varName) ?? [];
      const activeSnippets = snippets.filter(
        (s) => s.rCode && s.rCode.trim() !== "",
      );
      if (activeSnippets.length === 0) {
        skippedIndicators.add(indicator.varName);
        warnings.push(
          `Skipped indicator "${indicator.varName}": no R code configured for any time point`,
        );
        return false;
      }
      return true;
    });
  }

  // Build union dependency graph and validate
  const graphResult = buildUnionDependencyGraph(
    filteredIndicators,
    codeByIndicator,
    allIndicatorVarNames,
    knownDatasetVariables,
  );

  if (graphResult.validationErrors.length > 0) {
    if (stopIfIndicatorFails) {
      throw new Error(
        `Invalid indicator definitions:\n${graphResult.validationErrors.join("\n")}`,
      );
    }
    // Extract indicator names from validation errors and skip them
    for (const error of graphResult.validationErrors) {
      const match = error.match(/^Indicator "([^"]+)"/);
      if (match) {
        skippedIndicators.add(match[1]);
        warnings.push(`Skipped: ${error}`);
      }
    }
    filteredIndicators = filteredIndicators.filter(
      (ind) => !skippedIndicators.has(ind.varName),
    );
  }

  // Also skip indicators that depend on skipped indicators
  let changed = true;
  while (changed) {
    changed = false;
    for (const indicator of filteredIndicators) {
      const deps = graphResult.dependenciesMap.get(indicator.varName) ?? [];
      for (const dep of deps) {
        if (
          skippedIndicators.has(dep) &&
          !skippedIndicators.has(indicator.varName)
        ) {
          skippedIndicators.add(indicator.varName);
          warnings.push(
            `Skipped indicator "${indicator.varName}": depends on skipped indicator "${dep}"`,
          );
          changed = true;
          break;
        }
      }
    }
    filteredIndicators = filteredIndicators.filter(
      (ind) => !skippedIndicators.has(ind.varName),
    );
  }

  if (filteredIndicators.length === 0) {
    throw new Error(
      `No valid indicators to process. All indicators were skipped:\n${warnings.join("\n")}`,
    );
  }

  // Rebuild graph with filtered indicators for topological sort
  const filteredGraphResult = buildUnionDependencyGraph(
    filteredIndicators,
    codeByIndicator,
    allIndicatorVarNames,
    knownDatasetVariables,
  );

  const { ordered, cycles } = topologicalSort(
    filteredIndicators,
    filteredGraphResult,
  );
  if (cycles.length > 0) {
    throw new Error(
      `Circular dependencies detected:\n${formatCycles(cycles)}`,
    );
  }

  // Build dynamic R fragments
  const warningPrints = warnings
    .map((w) => `warning("${w.replace(/"/g, '\\"')}")`)
    .join("\n");

  // Only emit response-status columns when the installed definition declares
  // the status results object — older installed definitions have no status
  // section in script.R and must not gain stray columns.
  const supportsResponseStatus = moduleDefinition.resultsObjects.some(
    (ro) => ro.id === "M10_hfa_response_status.csv",
  );

  const indicatorMutates = ordered
    .map((indicator) => {
      const snippets = codeByIndicator.get(indicator.varName) ?? [];
      const activeSnippets = snippets.filter(
        (s) => s.rCode && s.rCode.trim() !== "",
      );
      if (activeSnippets.length === 0) {
        throw new Error(
          `Indicator "${indicator.varName}" has no R code configured for any time point. Configure R code for this indicator before running the module.`,
        );
      }
      const expr = buildPerTimePointMutateExpression(
        indicator,
        activeSnippets,
        allIndicatorVarNames,
        knownDatasetVariables,
        dontKnowAsNo,
        sentinelMap,
      );
      const valueMutate = `  mutate(${indicator.varName} = ${expr})`;
      if (!supportsResponseStatus) {
        return valueMutate;
      }
      const statusExpr = buildPerTimePointStatusExpression(
        activeSnippets,
        allIndicatorVarNames,
        knownDatasetVariables,
        sentinelMap,
      );
      return `${valueMutate} %>%\n  mutate(${indicator.varName}__status = ${statusExpr})`;
    })
    .join(" %>%\n");

  const indicatorCols = ordered
    .map((ind) => `"${ind.varName}"`)
    .join(", ");

  // Only emit hfa_service_category when the installed definition declares the
  // column — ingest rejects CSV headers missing from the table definition, so
  // module instances installed before the column existed must not produce it.
  const supportsServiceCategory = moduleDefinition.resultsObjects.some(
    (ro) =>
      ro.createTableStatementPossibleColumns !== false &&
      "hfa_service_category" in ro.createTableStatementPossibleColumns,
  );

  const indicatorMetadata = [
    `  hfa_indicator = c(${ordered.map((i) => `"${i.varName}"`).join(", ")})`,
    `  hfa_category = c(${ordered.map((i) => `"${i.categoryId ?? ""}"`).join(", ")})`,
    `  hfa_sub_category = c(${ordered.map((i) => `"${i.subCategoryId ?? ""}"`).join(", ")})`,
    ...(supportsServiceCategory
      ? [
        `  hfa_service_category = c(${ordered.map((i) => `"${serialiseMultiMembershipValues(i.serviceCategoryIds)}"`).join(", ")})`,
      ]
      : []),
    `  hfa_short_label = c(${ordered.map((i) => `"${i.shortLabel.replace(/"/g, '\\"')}"`).join(", ")})`,
    `  ind_type = c(${ordered.map((i) => `"${i.type}"`).join(", ")})`,
    `  ind_aggregation = c(${ordered.map((i) => `"${i.aggregation}"`).join(", ")})`,
  ].join(",\n");

  let str = moduleDefinition.script;

  // Standard substitutions
  str = str.replaceAll("COUNTRY_ISO3", `"${countryIso3 ?? "UNKNOWN"}"`);

  for (const ds of moduleDefinition.dataSources) {
    if (ds.sourceType === "dataset") {
      str = str.replaceAll(
        ds.replacementString,
        `'../datasets/${ds.datasetType}.csv'`,
      );
    } else {
      str = str.replaceAll(
        ds.replacementString,
        `../${ds.moduleId}/${ds.replacementString}`,
      );
    }
  }

  // Parameter substitutions
  for (const inputParam of configSelections.parameterDefinitions) {
    const mappedParameter =
      configSelections.parameterSelections[
        inputParam.replacementString
      ]?.trim();
    if (inputParam.input.inputType === "select") {
      if (inputParam.input.valueType === "string") {
        str = str.replaceAll(
          inputParam.replacementString,
          `'${mappedParameter ?? "UNSELECTED"}'`,
        );
      } else {
        str = str.replaceAll(
          inputParam.replacementString,
          mappedParameter ?? "UNSELECTED",
        );
      }
    }
    if (inputParam.input.inputType === "boolean") {
      str = str.replaceAll(
        inputParam.replacementString,
        mappedParameter ?? "FALSE",
      );
    }
    if (inputParam.input.inputType === "text") {
      str = str.replaceAll(
        inputParam.replacementString,
        `'${mappedParameter ?? "UNSELECTED"}'`,
      );
    }
    if (inputParam.input.inputType === "number") {
      str = str.replaceAll(
        inputParam.replacementString,
        mappedParameter ?? "UNSELECTED",
      );
    }
  }

  // Marker substitutions
  str = str.replaceAll("__WARNING_PRINTS__", warningPrints);
  str = str.replaceAll("__INDICATOR_MUTATES__", indicatorMutates);
  str = str.replaceAll("__INDICATOR_COLS__", indicatorCols);
  str = str.replaceAll("__INDICATOR_METADATA__", indicatorMetadata);
  str = str.replaceAll(
    "__HFA_TIME_POINT_ORDER__",
    hfaTimePointOrder.map((tp) => `"${tp.replace(/"/g, '\\"')}"`).join(", "),
  );

  return str;
}
