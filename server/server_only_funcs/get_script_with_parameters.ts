import {
  buildIndicatorIngredientsRLiteral,
  type CommonIndicatorCatalogRow,
  type HfaIndicator,
  type HfaIndicatorCode,
  type HfaIndicatorVariantCode,
  type ModuleConfigSelections,
  type ModuleDefinitionInstalled,
} from "lib";
import {
  getScriptWithParametersHfa,
  type HfaSentinelRow,
} from "./get_script_with_parameters_hfa.ts";

// datasetsDirPath = where the generated script finds dataset extract CSVs,
// relative to the module's working directory. A module workspace is
// runs/{runId}/outputs/{moduleId} (§2.1 run layout), so it reads
// "../../inputs/datasets".
export function getScriptWithParameters(
  moduleDefinition: ModuleDefinitionInstalled,
  configSelections: ModuleConfigSelections,
  countryIso3: string | undefined,
  datasetsDirPath: string,
  knownDatasetVariables?: Set<string>,
  hfaIndicators?: HfaIndicator[],
  hfaIndicatorCode?: HfaIndicatorCode[],
  hfaVariantCode?: HfaIndicatorVariantCode[],
  hfaSentinelRows?: HfaSentinelRow[],
  hfaTimePointOrder?: string[],
  commonIndicatorCatalog?: CommonIndicatorCatalogRow[],
): string {
  if (moduleDefinition.scriptGenerationType === "hfa") {
    if (!knownDatasetVariables) {
      throw new Error(
        "knownDatasetVariables is required for HFA module script generation"
      );
    }
    if (!hfaIndicators) {
      throw new Error(
        "hfaIndicators is required for HFA module script generation"
      );
    }
    return getScriptWithParametersHfa(
      moduleDefinition,
      configSelections,
      countryIso3,
      datasetsDirPath,
      hfaIndicators,
      hfaIndicatorCode ?? [],
      hfaVariantCode ?? [],
      knownDatasetVariables,
      hfaSentinelRows ?? [],
      hfaTimePointOrder ?? [],
    );
  }

  let str = moduleDefinition.script;

  str = str.replaceAll("COUNTRY_ISO3", `"${countryIso3 ?? "UNKNOWN"}"`);

  // The ingredient table travels as DATA substituted into an otherwise static
  // script (PLAN_1a §1.5, §1.14) — the same channel as COUNTRY_ISO3 above and
  // every module parameter below, and the reason no memoization input class
  // exists for it: the literal lands in scriptText, which computeModuleKey
  // already hashes. Only m012 carries the token; for every other module this
  // is a no-op.
  str = str.replaceAll(
    "INDICATOR_INGREDIENTS",
    buildIndicatorIngredientsRLiteral(commonIndicatorCatalog ?? [])
  );

  for (const ds of moduleDefinition.dataSources) {
    if (ds.sourceType === "dataset") {
      str = str.replaceAll(
        ds.replacementString,
        `'${datasetsDirPath}/${ds.datasetType}.csv'`
      );
    } else {
      str = str.replaceAll(
        ds.replacementString,
        `../${ds.moduleId}/${ds.replacementString}`
      );
    }
  }

  //////////////////////////////////////////
  //                                      //
  //    Update parameters if necessary    //
  //                                      //
  //////////////////////////////////////////
  for (const inputParam of configSelections.parameterDefinitions) {
      const mappedParameter =
        configSelections.parameterSelections[
          inputParam.replacementString
        ]?.trim();
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
  /////////////
  //         //
  //    .    //
  //         //
  /////////////

  return str;
}
