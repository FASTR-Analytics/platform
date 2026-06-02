import type {
  HfaIndicator,
  HfaIndicatorCode,
  ModuleConfigSelections,
  ModuleDefinitionInstalled,
} from "lib";
import {
  extractDependenciesFromCode,
  buildUnionDependencyGraph,
  topologicalSort,
  formatCycles,
} from "./hfa_dependency_analyzer.ts";

function generateMissingnessCheck(qids: string[]): string {
  const missingChecks = qids.map(
    (varName) => `is.na(${varName}) | ${varName} == -99`,
  );

  if (missingChecks.length === 0) {
    return "FALSE";
  } else if (missingChecks.length === 1) {
    return missingChecks[0];
  } else {
    return missingChecks.join(" | ");
  }
}

function buildPerTimePointMutateExpression(
  indicator: HfaIndicator,
  codeSnippets: HfaIndicatorCode[],
  allIndicatorVarNames: Set<string>,
  knownDatasetVariables: Set<string>,
): string {
  const timePointBranches: string[] = [];

  for (const snippet of codeSnippets) {
    const rCode = snippet.rCode.trim();
    if (!rCode) continue;

    const rFilterCode = snippet.rFilterCode?.trim() ?? "";
    const deps = extractDependenciesFromCode(
      rCode,
      snippet.rFilterCode,
      allIndicatorVarNames,
      knownDatasetVariables,
    );
    const missingnessCheck = generateMissingnessCheck(deps.qids);

    if (indicator.type === "numeric") {
      if (rFilterCode) {
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" & (${missingnessCheck}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" & !(${rFilterCode}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" ~ ${rCode}`,
        );
      } else {
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" & (${missingnessCheck}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" ~ ${rCode}`,
        );
      }
    } else {
      if (rFilterCode) {
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" & (${missingnessCheck}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" & !(${rFilterCode}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" & (${rCode}) ~ 1`,
        );
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" ~ 0`,
        );
      } else {
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" & (${missingnessCheck}) ~ NA_real_`,
        );
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" & (${rCode}) ~ 1`,
        );
        timePointBranches.push(
          `    time_point == "${snippet.timePoint}" ~ 0`,
        );
      }
    }
  }

  timePointBranches.push("    TRUE ~ NA_real_");

  return `case_when(\n${timePointBranches.join(",\n")}\n  )`;
}

export function getScriptWithParametersHfa(
  moduleDefinition: ModuleDefinitionInstalled,
  configSelections: ModuleConfigSelections,
  countryIso3: string | undefined,
  indicators: HfaIndicator[],
  indicatorCode: HfaIndicatorCode[],
  knownDatasetVariables: Set<string>,
): string {
  const stopIfIndicatorFails =
    configSelections.parameterSelections["STOP_IF_INDICATOR_FAILS"]?.trim() !==
      "FALSE";

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
      );
      return `  mutate(${indicator.varName} = ${expr})`;
    })
    .join(" %>%\n");

  const indicatorCols = ordered
    .map((ind) => `"${ind.varName}"`)
    .join(", ");

  const indicatorMetadata = [
    `  hfa_indicator = c(${ordered.map((i) => `"${i.varName}"`).join(", ")})`,
    `  hfa_category = c(${ordered.map((i) => `"${i.categoryId ?? ""}"`).join(", ")})`,
    `  hfa_sub_category = c(${ordered.map((i) => `"${i.subCategoryId ?? ""}"`).join(", ")})`,
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

  return str;
}
