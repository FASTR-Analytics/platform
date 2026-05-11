import type {
  CalculatedIndicator,
  ModuleConfigSelections,
  ModuleDefinitionInstalled,
} from "lib";
import {
  assertValidCalculatedIndicatorIdentifier,
  assertValidPopulationType,
} from "lib";

export function getScriptWithParametersCalculatedIndicators(
  moduleDefinition: ModuleDefinitionInstalled,
  configSelections: ModuleConfigSelections,
  countryIso3: string | undefined,
  calculatedIndicators: CalculatedIndicator[],
): string {
  // Defense in depth: validate all IDs before generating R code
  for (const ci of calculatedIndicators) {
    assertValidCalculatedIndicatorIdentifier(
      ci.calculated_indicator_id,
      "calculated_indicator_id"
    );
    assertValidCalculatedIndicatorIdentifier(
      ci.num_indicator_id,
      "num_indicator_id"
    );
    if (ci.denom.kind === "indicator") {
      assertValidCalculatedIndicatorIdentifier(
        ci.denom.indicator_id,
        "denom_indicator_id"
      );
    } else if (ci.denom.kind === "population") {
      assertValidPopulationType(ci.denom.population_type, "denom_population_type");
    }
    // "none" kind has no additional fields to validate
  }

  let str = moduleDefinition.script;

  // Standard substitutions
  str = str.replaceAll("COUNTRY_ISO3", `"${countryIso3 ?? "UNKNOWN"}"`);

  for (const ds of moduleDefinition.dataSources) {
    if (ds.sourceType === "dataset") {
      str = str.replaceAll(
        ds.replacementString,
        `'../datasets/${ds.datasetType}.csv'`
      );
    } else {
      str = str.replaceAll(
        ds.replacementString,
        `../${ds.moduleId}/${ds.replacementString}`
      );
    }
  }

  // Parameter substitutions
  for (const inputParam of configSelections.parameterDefinitions) {
    const mappedParameter =
      configSelections.parameterSelections[inputParam.replacementString]?.trim();
    if (inputParam.input.inputType === "select") {
      if (inputParam.input.valueType === "string") {
        str = str.replaceAll(
          inputParam.replacementString,
          `'${mappedParameter ?? "UNSELECTED"}'`
        );
      } else {
        str = str.replaceAll(
          inputParam.replacementString,
          mappedParameter ?? "UNSELECTED"
        );
      }
    }
    if (inputParam.input.inputType === "boolean") {
      str = str.replaceAll(
        inputParam.replacementString,
        mappedParameter ?? "FALSE"
      );
    }
    if (inputParam.input.inputType === "text") {
      str = str.replaceAll(
        inputParam.replacementString,
        `'${mappedParameter ?? "UNSELECTED"}'`
      );
    }
    if (inputParam.input.inputType === "number") {
      str = str.replaceAll(
        inputParam.replacementString,
        mappedParameter ?? "UNSELECTED"
      );
    }
  }

  // Generate per-indicator R blocks
  const blocks: string[] = [];
  blocks.push(`message("  Computing ${calculatedIndicators.length} calculated indicator(s)...")`);
  for (let i = 0; i < calculatedIndicators.length; i++) {
    const ci = calculatedIndicators[i];
    const varName = `rows_${i + 1}`;

    let denomExpr: string;
    let denomColName: string | null;
    if (ci.denom.kind === "none") {
      denomExpr = "1";
      denomColName = null;
    } else if (ci.denom.kind === "indicator") {
      denomExpr = `data[["${ci.denom.indicator_id}"]]`;
      denomColName = ci.denom.indicator_id;
    } else {
      denomExpr = `data[["${ci.denom.population_type}"]] * ${ci.denom.multiplier} * PERIOD_FRACTION`;
      denomColName = ci.denom.population_type;
    }

    if (denomColName === null) {
      // No denominator column to check
      blocks.push(`
# ${ci.calculated_indicator_id}
{
  num_col <- "${ci.num_indicator_id}"
  num_ok <- num_col %in% names(data)
  if (!num_ok) stop("ERROR: Calculated indicator '${ci.calculated_indicator_id}' requires numerator column '", num_col, "' but it is missing from the data. Check your indicator configuration.")
  ${varName} <- data %>%
    select(all_of(geo_cols), period_id) %>%
    mutate(
      indicator_common_id = "${ci.calculated_indicator_id}",
      numerator = data[[num_col]],
      denominator = ${denomExpr}
    )
}`);
    } else {
      blocks.push(`
# ${ci.calculated_indicator_id}
{
  num_col <- "${ci.num_indicator_id}"
  denom_col <- "${denomColName}"
  num_ok <- num_col %in% names(data)
  denom_ok <- denom_col %in% names(data)
  if (!num_ok) stop("ERROR: Calculated indicator '${ci.calculated_indicator_id}' requires numerator column '", num_col, "' but it is missing from the data. Check your indicator configuration.")
  if (!denom_ok) stop("ERROR: Calculated indicator '${ci.calculated_indicator_id}' requires denominator column '", denom_col, "' but it is missing. For population-based denominators, ensure population.csv includes this population_type.")
  ${varName} <- data %>%
    select(all_of(geo_cols), period_id) %>%
    mutate(
      indicator_common_id = "${ci.calculated_indicator_id}",
      numerator = data[[num_col]],
      denominator = ${denomExpr}
    )
}`);
    }
  }

  // Generate the bind_rows call
  const varNames = calculatedIndicators.map((_, i) => `rows_${i + 1}`);
  const bindRowsCall = `bind_rows(${varNames.join(", ")})`;

  // Replace the marker with generated blocks + bind_rows
  const generatedCode = blocks.join("\n") + "\n\n" + bindRowsCall;
  str = str.replaceAll("__CALCULATED_INDICATOR_BLOCKS__", generatedCode);

  return str;
}
