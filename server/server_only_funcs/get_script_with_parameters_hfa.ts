import type { HfaIndicator } from "lib";
import {
  extractDependencies,
  buildDependencyGraph,
  topologicalSort,
  formatCycles,
} from "./hfa_dependency_analyzer.ts";

function generateMissingnessCheck(qids: string[]): string {
  const missingChecks = qids.map(
    (varName) => `is.na(${varName}) | ${varName} == -99`
  );

  if (missingChecks.length === 0) {
    return "FALSE";
  } else if (missingChecks.length === 1) {
    return missingChecks[0];
  } else {
    return missingChecks.join(" | ");
  }
}

function getFinalMutateExpression(
  rCode: string,
  qids: string[],
  rFilterCode: string | undefined,
  type: "binary" | "numeric"
): string {
  const cleanRCode = rCode.trim();
  const cleanRFilterCode = rFilterCode?.trim() ?? "";
  const missingnessCheck = generateMissingnessCheck(qids);
  const hasFilter = cleanRFilterCode !== "";

  if (type === "numeric") {
    if (hasFilter) {
      return `case_when(
    ${missingnessCheck} ~ NA_real_,
    !(${cleanRFilterCode}) ~ NA_real_,
    TRUE ~ ${cleanRCode}
  )`;
    }
    return `case_when(
    ${missingnessCheck} ~ NA_real_,
    TRUE ~ ${cleanRCode}
  )`;
  }

  if (hasFilter) {
    return `case_when(
    ${missingnessCheck} ~ NA_real_,
    !(${cleanRFilterCode}) ~ NA_real_,
    ${cleanRCode} ~ 1,
    TRUE ~ 0
  )`;
  }

  return `case_when(
    ${missingnessCheck} ~ NA_real_,
    ${cleanRCode} ~ 1,
    TRUE ~ 0
  )`;
}

export function getScriptWithParametersHfa(
  indicators: HfaIndicator[],
  knownDatasetVariables: Set<string>
): string {
  const allIndicatorVarNames = new Set(indicators.map((ind) => ind.varName));

  const validationErrors: string[] = [];
  for (const indicator of indicators) {
    const deps = extractDependencies(
      indicator,
      allIndicatorVarNames,
      knownDatasetVariables
    );

    if (deps.unknownVariables.length > 0) {
      validationErrors.push(
        `Indicator "${indicator.varName}": Unknown variables [${deps.unknownVariables.join(", ")}] in rCode/rFilterCode. Not found in dataset variables or other indicators.`
      );
    }
  }

  if (validationErrors.length > 0) {
    throw new Error(
      `Invalid indicator definitions:\n${validationErrors.join("\n")}`
    );
  }

  const graphResult = buildDependencyGraph(
    indicators,
    allIndicatorVarNames,
    knownDatasetVariables
  );

  const { ordered, cycles } = topologicalSort(indicators, graphResult);
  if (cycles.length > 0) {
    throw new Error(
      `Circular dependencies detected:\n${formatCycles(cycles)}`
    );
  }

  const orderedIndicators = ordered;
  const script = `
library(dplyr)
library(tidyr)

print("Starting HFA script...")

# Read and pivot data to wide format
data <- read.csv('../datasets/hfa.csv')
data_wide <- data %>%
  pivot_wider(names_from = var_name, values_from = value)

# Detect facility columns dynamically
facility_cols <- names(data_wide)[grepl("^(facility_|admin_area_|time_point)", names(data_wide))]

# Calculate indicators
results <- data_wide %>%
${orderedIndicators
  .map((indicator) => {
    const deps = extractDependencies(
      indicator,
      allIndicatorVarNames,
      knownDatasetVariables
    );
    return `  mutate(${indicator.varName} = ${getFinalMutateExpression(
      indicator.rCode,
      deps.qids,
      indicator.rFilterCode,
      indicator.type
    )})`;
  })
  .join(" %>%\n")}

# Select only indicator columns
indicator_cols <- c(${orderedIndicators
    .map((ind) => `"${ind.varName}"`)
    .join(", ")})
results_final <- results %>%
  select(all_of(indicator_cols))

# Create category mapping
indicator_categories <- data.frame(
  hfa_indicator = c(${orderedIndicators
    .map((indicator) => `"${indicator.varName}"`)
    .join(", ")}),
  hfa_category = c(${orderedIndicators
    .map((indicator) => `"${indicator.category}"`)
    .join(", ")})
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

# Write output
write.csv(results_long, "HFA001_results.csv", row.names = FALSE)

print("HFA script completed successfully!")
`;

  return script;
}
