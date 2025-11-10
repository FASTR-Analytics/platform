import {
  ChartOVJsonDataConfig,
  TableJsonDataConfig,
  TimeseriesJsonDataConfig,
} from "panther";
import {
  PresentationObjectConfig,
  ResultsValue,
  getDisaggregatorDisplayProp,
  getFilteredValueProps,
  get_INDICATOR_COMMON_IDS_IN_SORT_ORDER,
  t,
  t2,
  T,
} from "lib";
import { getDateLabelReplacements } from "./get_date_label_replacements";
import { getAdminArea3LabelReplacements } from "./format_admin_area_labels";

export function getTimeseriesJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValue,
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

    const adminArea3LabelReplacements =
      config.s.formatAdminArea3Labels && jsonArray
        ? getAdminArea3LabelReplacements(jsonArray)
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
        ...adminArea3LabelReplacements,
        __NATIONAL: t2(T.FRENCH_UI_STRINGS.national),
        zzNATIONAL: t2(T.FRENCH_UI_STRINGS.national),
      },
    };
    return dataConfig;
  }
  throw new Error("Bad config type");
}

export function getTableJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValue,
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

    const adminArea3LabelReplacements =
      config.s.formatAdminArea3Labels && jsonArray
        ? getAdminArea3LabelReplacements(jsonArray)
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
        ...adminArea3LabelReplacements,
        __NATIONAL: t2(T.FRENCH_UI_STRINGS.national),
        zzNATIONAL: t2(T.FRENCH_UI_STRINGS.national),
      },
    };
    return dataConfig;
  }
  throw new Error("Bad config type");
}

export function getChartOVJsonDataConfigFromPresentationObjectConfig(
  resultsValue: ResultsValue,
  config: PresentationObjectConfig,
  indicatorLabelReplacements: Record<string, string>,
  jsonArray?: any[],
): ChartOVJsonDataConfig {
  if (config.d.type === "chart") {
    const includesIndicatorDisaggregation = config.d.disaggregateBy.some(
      (d) => d.disOpt === "indicator_common_id",
    );

    const adminArea3LabelReplacements =
      config.s.formatAdminArea3Labels && jsonArray
        ? getAdminArea3LabelReplacements(jsonArray)
        : {};

    const dataConfig: ChartOVJsonDataConfig = {
      valueProps: getFilteredValueProps(resultsValue.valueProps, config),
      indicatorProp:
        getDisaggregatorDisplayProp(resultsValue, config, ["indicator"]) ??
        "--v",
      seriesProp: getDisaggregatorDisplayProp(resultsValue, config, ["series"]),
      paneProp: getDisaggregatorDisplayProp(resultsValue, config, ["cell"]),
      laneProp: getDisaggregatorDisplayProp(resultsValue, config, [
        "col",
        "colGroup",
      ]),
      tierProp: getDisaggregatorDisplayProp(resultsValue, config, [
        "row",
        "rowGroup",
      ]),
      //
      sortHeaders: includesIndicatorDisaggregation
        ? get_INDICATOR_COMMON_IDS_IN_SORT_ORDER()
        : true,
      sortIndicatorValues: config.s.sortIndicatorValues,
      labelReplacementsBeforeSorting: resultsValue.valueLabelReplacements ?? {},
      labelReplacementsAfterSorting: {
        ...indicatorLabelReplacements,
        ...adminArea3LabelReplacements,
        __NATIONAL: t2(T.FRENCH_UI_STRINGS.national),
        zzNATIONAL: t2(T.FRENCH_UI_STRINGS.national),
      },
    };
    return dataConfig;
  }
  throw new Error("Bad config type");
}
