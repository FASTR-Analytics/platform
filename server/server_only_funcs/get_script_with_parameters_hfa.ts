import type { HfaIndicator, HfaIndicatorCode } from "lib";
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
  indicators: HfaIndicator[],
  indicatorCode: HfaIndicatorCode[],
  knownDatasetVariables: Set<string>,
  stopIfIndicatorFails: boolean,
): string {
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
        if (skippedIndicators.has(dep) && !skippedIndicators.has(indicator.varName)) {
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

  const { ordered, cycles } = topologicalSort(filteredIndicators, filteredGraphResult);
  if (cycles.length > 0) {
    throw new Error(
      `Circular dependencies detected:\n${formatCycles(cycles)}`,
    );
  }

  const warningPrints = warnings.length > 0
    ? warnings.map((w) => `warning("${w.replace(/"/g, '\\"')}")`).join("\n") + "\n\n"
    : "";

  const script = `
library(dplyr)
library(tidyr)

print("Starting HFA script...")
${warningPrints}
# Read and pivot data to wide format
data <- read.csv('../datasets/hfa.csv')
data_wide <- data %>%
  pivot_wider(names_from = var_name, values_from = value)

# Detect facility columns dynamically
facility_cols <- names(data_wide)[grepl("^(facility_|admin_area_|time_point)", names(data_wide))]

# Convert pivoted variable columns to numeric (they may be character after pivot)
data_wide <- data_wide %>%
  mutate(across(-all_of(facility_cols), as.numeric))

# Calculate indicators
results <- data_wide %>%
${ordered
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
  .join(" %>%\n")}

# Select only indicator columns
indicator_cols <- c(${ordered.map((ind) => `"${ind.varName}"`).join(", ")})
results_final <- results %>%
  select(all_of(indicator_cols))

# Create category mapping
indicator_categories <- data.frame(
  hfa_indicator = c(${ordered.map((indicator) => `"${indicator.varName}"`).join(", ")}),
  hfa_category = c(${ordered.map((indicator) => `"${indicator.category}"`).join(", ")})
)

# Pivot back to long format and add categories
facility_info <- data_wide %>%
  select(all_of(facility_cols))

results_long <- facility_info %>%
  bind_cols(results_final) %>%
  pivot_longer(
    cols = all_of(indicator_cols),
    names_to = "hfa_indicator",
    values_to = "value"
  ) %>%
  left_join(indicator_categories, by = "hfa_indicator") %>%
  filter(!is.na(value))

if (nrow(results_long) == 0) {
  stop("No results generated - all indicator values are NA. Check that HFA indicators have been configured with R code.")
}

# Write output
write.csv(results_long, "HFA001_results.csv", row.names = FALSE)

print("HFA script completed successfully!")
`;

  return script;
}
