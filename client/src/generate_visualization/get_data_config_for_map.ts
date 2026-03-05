import type { MapJsonDataConfig } from "panther";
import {
  type PresentationObjectConfig,
  type ResultsValueForVisualization,
  getDisaggregatorDisplayProp,
  getFilteredValueProps,
} from "lib";

export function getMapJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  indicatorLabelReplacements: Record<string, string>,
): MapJsonDataConfig {
  if (config.d.type !== "map") {
    throw new Error("Bad config type");
  }

  const filteredValueProps = getFilteredValueProps(resultsValue.valueProps, config);
  const valueProp = filteredValueProps[0] ?? "value";

  const areaProp =
    getDisaggregatorDisplayProp(resultsValue, config, ["mapArea"]) ?? "admin_area_2";

  const paneProp = getDisaggregatorDisplayProp(resultsValue, config, ["cell"]);
  const laneProp = getDisaggregatorDisplayProp(resultsValue, config, ["col"]);
  const tierProp = getDisaggregatorDisplayProp(resultsValue, config, ["row"]);

  const dataConfig: MapJsonDataConfig = {
    valueProp,
    areaProp,
    areaMatchProp: "area_id",
    paneProp,
    tierProp,
    laneProp,
    labelReplacements: indicatorLabelReplacements,
  };

  return dataConfig;
}
