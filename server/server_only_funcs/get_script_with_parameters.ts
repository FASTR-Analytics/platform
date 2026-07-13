import type {
  CalculatedIndicator,
  HfaIndicator,
  HfaIndicatorCode,
  ModuleConfigSelections,
  ModuleDefinitionInstalled,
} from "lib";
import { getScriptWithParametersCalculatedIndicators } from "./get_script_with_parameters_calculated_indicators.ts";
import {
  getScriptWithParametersHfa,
  type HfaSentinelRow,
} from "./get_script_with_parameters_hfa.ts";

// datasetsDirPath = where the generated script finds dataset extract CSVs,
// relative to the module's working directory. Per-caller: the legacy sandbox
// layout puts them at "../datasets" (sandbox/{projectId}/datasets beside each
// module dir); a run workspace (runs/{runId}/outputs/{moduleId}) reads
// "../../inputs/datasets" (§2.1 run layout).
export function getScriptWithParameters(
  moduleDefinition: ModuleDefinitionInstalled,
  configSelections: ModuleConfigSelections,
  countryIso3: string | undefined,
  datasetsDirPath: string,
  knownDatasetVariables?: Set<string>,
  hfaIndicators?: HfaIndicator[],
  hfaIndicatorCode?: HfaIndicatorCode[],
  calculatedIndicators?: CalculatedIndicator[],
  hfaSentinelRows?: HfaSentinelRow[],
  hfaTimePointOrder?: string[],
): string {
  if (moduleDefinition.scriptGenerationType === "calculated_indicators") {
    if (!calculatedIndicators) {
      throw new Error(
        "calculatedIndicators is required for calculated_indicators module script generation"
      );
    }
    return getScriptWithParametersCalculatedIndicators(
      moduleDefinition,
      configSelections,
      countryIso3,
      datasetsDirPath,
      calculatedIndicators,
    );
  }

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
      knownDatasetVariables,
      hfaSentinelRows ?? [],
      hfaTimePointOrder ?? [],
    );
  }

  let str = moduleDefinition.script;

  str = str.replaceAll("COUNTRY_ISO3", `"${countryIso3 ?? "UNKNOWN"}"`);

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
