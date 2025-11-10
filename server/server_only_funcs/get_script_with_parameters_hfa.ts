import type { HfaIndicator } from "lib";

function generateMissingnessCheck(validQIDs: string[]): string {
  const missingChecks = validQIDs.map(
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
  validQIDs: string[],
  type: "binary" | "numeric"
): string {
  const missingnessCheck = generateMissingnessCheck(validQIDs);

  if (type === "numeric") {
    return `case_when(
    ${missingnessCheck} ~ NA_real_,
    TRUE ~ ${rCode}
  )`;
  }

  return `case_when(
    ${missingnessCheck} ~ NA_real_,
    ${rCode} ~ 1,
    TRUE ~ 0
  )`;
}

export function getScriptWithParametersHfa(indicators: HfaIndicator[]): string {
  const script = `
library(dplyr)
library(tidyr)

print("Starting the HFA script...")

data <- read.csv('../datasets/hfa.csv')

# Get available variables from the dataset
available_vars <- unique(data$var_name)
print(paste("Found", length(available_vars), "variables in dataset"))

# Convert to wide format
data_wide <- data %>%
  pivot_wider(names_from = var_name, values_from = value)

print(paste("Data converted to wide format with", ncol(data_wide), "columns"))
print("Sample column names:")
print(head(names(data_wide), 20))

# Check a few key columns before numeric conversion
print("Sample data before numeric conversion:")
if ("sh_04a_y" %in% names(data_wide)) {
  print(paste("sh_04a_y values:", paste(head(data_wide$sh_04a_y, 5), collapse=", ")))
}
if ("inf_01" %in% names(data_wide)) {
  print(paste("inf_01 values:", paste(head(data_wide$inf_01, 5), collapse=", ")))
}

# Detect facility columns dynamically (all columns that start with facility_ or admin_area_, plus facility_id)
facility_cols <- names(data_wide)[grepl("^(facility_|admin_area_|time_point)", names(data_wide))]
print(paste("Detected facility columns:", paste(facility_cols, collapse=", ")))

# Convert all possible columns to numeric (except facility columns)
data_wide <- data_wide %>%
  mutate(across(-all_of(facility_cols),
                ~ suppressWarnings(as.numeric(ifelse(. == "" | . == " ", NA, .)))))

print("Sample data after numeric conversion:")
if ("sh_04a_y" %in% names(data_wide)) {
  print(paste("sh_04a_y values:", paste(head(data_wide$sh_04a_y, 5), collapse=", ")))
}
if ("inf_01" %in% names(data_wide)) {
  print(paste("inf_01 values:", paste(head(data_wide$inf_01, 5), collapse=", ")))
}

# Filter indicators based on available variables
available_indicators <- c()
${indicators
  .map((indicator) => {
    const requiredVars = indicator.validQIDs;
    return `
# Check ${indicator.varName}: requires [${requiredVars.join(", ")}]
required_vars_${indicator.varName} <- c(${requiredVars
      .map((v) => `"${v}"`)
      .join(", ")})
if (all(required_vars_${indicator.varName} %in% names(data_wide))) {
  available_indicators <- c(available_indicators, "${indicator.varName}")
  print(paste("✓ Can calculate:", "${indicator.varName}"))
} else {
  missing_vars <- setdiff(required_vars_${indicator.varName}, names(data_wide))
  print(paste("✗ Cannot calculate ${
    indicator.varName
  }, missing:", paste(missing_vars, collapse=", ")))
}`;
  })
  .join("\n")}

print(paste("Can calculate", length(available_indicators), "out of ${
    indicators.length
  } indicators"))

# Calculate only the available indicators
results <- data_wide
${indicators
  .map(
    (indicator) => `
if ("${indicator.varName}" %in% available_indicators) {
  results <- results %>%
    mutate(${indicator.varName} = ${getFinalMutateExpression(
      indicator.rCode,
      indicator.validQIDs,
      indicator.type
    )})
}`
  )
  .join("\n")}

# Select only the successfully calculated indicator columns
calculated_indicators <- intersect(available_indicators, names(results))
results_final <- results %>%
  select(all_of(calculated_indicators))

print(paste("Successfully calculated", ncol(results_final), "indicators"))
print("First few calculated indicators:")
if (ncol(results_final) > 0) {
  print(head(names(results_final), 10))
} else {
  print("No indicators were calculated")
}

# Create category mapping for indicators
indicator_categories <- data.frame(
  hfa_indicator = c(${indicators
    .map((indicator) => `"${indicator.varName}"`)
    .join(", ")}),
  hfa_category = c(${indicators
    .map((indicator) => `"${indicator.category}"`)
    .join(", ")})
)

# Pivot back to long format to match original structure
# Use the dynamically detected facility columns
facility_info <- data_wide %>%
  select(all_of(facility_cols))

# Combine facility info with results and pivot to long format
results_long <- facility_info %>%
  bind_cols(results_final) %>%
  pivot_longer(
    cols = all_of(calculated_indicators),
    names_to = "hfa_indicator",
    values_to = "value"
  ) %>%
  # Add category information
  left_join(indicator_categories, by = "hfa_indicator")

print(paste("Converted results back to long format:", nrow(results_long), "rows"))

# Drop rows where value is NA
results_long <- results_long %>%
  filter(!is.na(value))

print(paste("After dropping NA values:", nrow(results_long), "rows"))

write.csv(results_long, "HFA001_results.csv", row.names = FALSE)

print("HFA script completed successfully!")
`;

  return script;
}
