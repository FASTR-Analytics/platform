import type { MapJsonDataConfig } from "panther";
import {
  type PresentationObjectConfig,
  type ResultsValueForVisualization,
  getDisaggregatorDisplayProp,
} from "lib";
import { getAxisSort } from "./get_data_config_from_po";

export function getMapJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  effectiveValueProps: string[],
  indicatorLabelReplacements: Record<string, string>,
): MapJsonDataConfig {
  if (config.d.type !== "map") {
    throw new Error("Bad config type");
  }

  const valueProp = effectiveValueProps[0] ?? "value";

  const areaProp =
    getDisaggregatorDisplayProp(resultsValue, config, ["mapArea"], effectiveValueProps) ?? "admin_area_2";

  const paneProp = getDisaggregatorDisplayProp(resultsValue, config, ["cell"], effectiveValueProps);
  const laneProp = getDisaggregatorDisplayProp(resultsValue, config, ["col"], effectiveValueProps);
  const tierProp = getDisaggregatorDisplayProp(resultsValue, config, ["row"], effectiveValueProps);

  const dataConfig: MapJsonDataConfig = {
    valueProp,
    areaProp,
    areaMatchProp: "area_id",
    paneProp,
    tierProp,
    laneProp,
    labelReplacements: indicatorLabelReplacements,
    // Map labelReplacements carry only indicator labels, so by-label on other
    // dims sorts on raw values — which is what the map displays, keeping sort
    // key and display consistent.
    sort: {
      pane: getAxisSort(config, paneProp),
      tier: getAxisSort(config, tierProp),
      lane: getAxisSort(config, laneProp),
    },
  };

  return dataConfig;
}
