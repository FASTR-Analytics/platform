import {
  ChartOVJsonDataConfig,
  TableJsonDataConfig,
  TimeseriesJsonDataConfig,
} from "panther";
import {
  CountryCodes,
  PresentationObjectConfig,
  ResultsValueForVisualization,
  getDisaggregatorDisplayProp,
  getFilteredValueProps,
  get_INDICATOR_COMMON_IDS_IN_SORT_ORDER,
  t3,
  TC,
} from "lib";
import { instanceState } from "../state/instance/t1_store";
import { getDateLabelReplacements } from "./get_date_label_replacements";
import { getNigeriaAdminAreaLabelReplacements } from "./format_admin_area_labels";

export function getTimeseriesJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  indicatorLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): TimeseriesJsonDataConfig {
  if (config.d.type === "timeseries") {
    const includesIndicatorDisaggregation = config.d.disaggregateBy.some(
      (d) => d.disOpt === "indicator_common_id",
    );
    const periodType =
      config.d.periodOpt === "period_id"
        ? "year-month"
        : config.d.periodOpt === "quarter_id"
          ? "year-quarter"
          : "year";

    const nigeriaAdminAreaLabelReplacements =
      instanceState.countryIso3 === CountryCodes.Nigeria && jsonArray
        ? getNigeriaAdminAreaLabelReplacements(jsonArray)
        : {};

    const dataConfig: TimeseriesJsonDataConfig = {
      valueProps: getFilteredValueProps(resultsValue.valueProps, config),
      periodProp: config.d.periodOpt,
      periodType,
      seriesProp:
        getDisaggregatorDisplayProp(resultsValue, config, ["series"]) ?? "--v",
      paneProp: getDisaggregatorDisplayProp(resultsValue, config, ["cell"]),
      laneProp: getDisaggregatorDisplayProp(resultsValue, config, [
        "col",
        "colGroup",
      ]),
      tierProp: getDisaggregatorDisplayProp(resultsValue, config, [
        "row",
        "rowGroup",
      ]),
      sortHeaders: includesIndicatorDisaggregation
        ? get_INDICATOR_COMMON_IDS_IN_SORT_ORDER()
        : true,
      labelReplacementsBeforeSorting: resultsValue.valueLabelReplacements ?? {},
      labelReplacementsAfterSorting: {
        ...indicatorLabelReplacements,
        ...nigeriaAdminAreaLabelReplacements,
        __NATIONAL: t3(TC.national),
        zzNATIONAL: t3(TC.national),
      },
    };
    return dataConfig;
  }
  throw new Error("Bad config type");
}

export function getTableJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  indicatorLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): TableJsonDataConfig {
  if (config.d.type === "table") {
    const includesIndicatorDisaggregation = config.d.disaggregateBy.some(
      (d) => d.disOpt === "indicator_common_id",
    );

    const colProp =
      getDisaggregatorDisplayProp(resultsValue, config, ["col"]) ?? "--v";
    const rowProp = getDisaggregatorDisplayProp(resultsValue, config, ["row"]);
    const colGroupProp = getDisaggregatorDisplayProp(resultsValue, config, [
      "colGroup",
    ]);
    const rowGroupProp = getDisaggregatorDisplayProp(resultsValue, config, [
      "rowGroup",
    ]);

    const dateLabelReplacements = jsonArray
      ? getDateLabelReplacements(jsonArray, [
          colProp,
          rowProp,
          colGroupProp,
          rowGroupProp,
        ])
      : {};

    const nigeriaAdminAreaLabelReplacements =
      instanceState.countryIso3 === CountryCodes.Nigeria && jsonArray
        ? getNigeriaAdminAreaLabelReplacements(jsonArray)
        : {};

    const dataConfig: TableJsonDataConfig = {
      valueProps: getFilteredValueProps(resultsValue.valueProps, config),
      colProp,
      rowProp,
      colGroupProp,
      rowGroupProp,
      //
      sortHeaders: includesIndicatorDisaggregation
        ? get_INDICATOR_COMMON_IDS_IN_SORT_ORDER()
        : true,
      labelReplacementsBeforeSorting: resultsValue.valueLabelReplacements ?? {},
      labelReplacementsAfterSorting: {
        ...indicatorLabelReplacements,
        ...dateLabelReplacements,
        ...nigeriaAdminAreaLabelReplacements,
        __NATIONAL: t3(TC.national),
        zzNATIONAL: t3(TC.national),
      },
    };
    return dataConfig;
  }
  throw new Error("Bad config type");
}

export function getChartOVJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValueForVisualization,
  config: PresentationObjectConfig,
  indicatorLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): ChartOVJsonDataConfig {
  if (config.d.type === "chart") {
    const includesIndicatorDisaggregation = config.d.disaggregateBy.some(
      (d) => d.disOpt === "indicator_common_id",
    );

    const indicatorProp =
      getDisaggregatorDisplayProp(resultsValue, config, ["indicator"]) ??
      "--v";
    const seriesProp = getDisaggregatorDisplayProp(resultsValue, config, ["series"]);
    const paneProp = getDisaggregatorDisplayProp(resultsValue, config, ["cell"]);
    const laneProp = getDisaggregatorDisplayProp(resultsValue, config, [
      "col",
      "colGroup",
    ]);
    const tierProp = getDisaggregatorDisplayProp(resultsValue, config, [
      "row",
      "rowGroup",
    ]);

    const dateLabelReplacements = jsonArray
      ? getDateLabelReplacements(jsonArray, [
          indicatorProp,
          seriesProp,
          paneProp,
          laneProp,
          tierProp,
        ])
      : {};

    const nigeriaAdminAreaLabelReplacements =
      instanceState.countryIso3 === CountryCodes.Nigeria && jsonArray
        ? getNigeriaAdminAreaLabelReplacements(jsonArray)
        : {};

    const dataConfig: ChartOVJsonDataConfig = {
      valueProps: getFilteredValueProps(resultsValue.valueProps, config),
      indicatorProp,
      seriesProp,
      paneProp,
      laneProp,
      tierProp,
      //
      sortHeaders: includesIndicatorDisaggregation
        ? get_INDICATOR_COMMON_IDS_IN_SORT_ORDER()
        : true,
      sortIndicatorValues: config.s.sortIndicatorValues,
      labelReplacementsBeforeSorting: resultsValue.valueLabelReplacements ?? {},
      labelReplacementsAfterSorting: {
        ...indicatorLabelReplacements,
        ...dateLabelReplacements,
        ...nigeriaAdminAreaLabelReplacements,
        __NATIONAL: t3(TC.national),
        zzNATIONAL: t3(TC.national),
      },
    };
    return dataConfig;
  }
  throw new Error("Bad config type");
}
