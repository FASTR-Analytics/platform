import {
  getPeriodIdFromTime,
  getSortedAlphabetical,
  getSortedAlphabeticalByFunc,
  getTimeFromPeriodId,
} from "@timroberton/panther";
import { getReplicateByProp } from "./get_disaggregator_display_prop.ts";
import {
  periodFilterHasBounds,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  type PeriodBounds,
  type PeriodFilter,
  type ResultsValueInfoForPresentationObject,
} from "./types/presentation_objects.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import type { PeriodOption } from "./types/_metric_installed.ts";
import type { ResultsValue } from "./types/modules.ts";
import type { APIResponseWithData } from "./types/instance.ts";
import { getCalendar } from "./translate/mod.ts";

export function getFetchConfigFromPresentationObjectConfig(
  resultsValue: ResultsValue,
  config: PresentationObjectConfig,
  options?: { excludeReplicantFilter?: boolean },
): APIResponseWithData<GenericLongFormFetchConfig> {
  const groupBys: (DisaggregationOption | PeriodOption)[] = [];

  for (const dis of config.d.disaggregateBy) {
    groupBys.push(dis.disOpt);
  }

  if (config.d.type === "timeseries") {
    if (!config.d.timeseriesGrouping) {
      throw new Error("Timeseries config missing timeseriesGrouping");
    }
    groupBys.push(config.d.timeseriesGrouping);
  }

  const shouldIncludeNationalAggregate = config.d.includeNationalForAdminArea2;
  const nationalAggregateIsAllowed = config.d.disaggregateBy.some((d) => {
    return d.disOpt === "admin_area_2" && d.disDisplayOpt !== "replicant";
  });
  const includeNationalForAdminArea2 =
    shouldIncludeNationalAggregate && nationalAggregateIsAllowed;

  const filters = options?.excludeReplicantFilter
    ? getFiltersWithoutReplicant(config)
    : getFiltersWithReplicant(config);

  if (resultsValue.postAggregationExpression) {
    const rvPAE = resultsValue.postAggregationExpression;
    return {
      success: true,
      data: {
        values: rvPAE.ingredientValues,
        postAggregationExpression: rvPAE.expression,
        groupBys,
        filters,
        periodFilter: config.d.periodFilter,
        includeNationalForAdminArea2,
        includeNationalPosition: config.d.includeNationalPosition,
      },
    };
  }

  return {
    success: true,
    data: {
      values: getFilteredValueProps(resultsValue.valueProps, config).map(
        (vp) => {
          return { prop: vp, func: resultsValue.valueFunc };
        },
      ),
      postAggregationExpression: undefined,
      groupBys,
      filters,
      periodFilter: config.d.periodFilter,
      includeNationalForAdminArea2,
      includeNationalPosition: config.d.includeNationalPosition,
    },
  };
}

export function getPeriodFilterExactBounds(
  periodFilter: PeriodFilter | undefined,
  periodBounds: PeriodBounds | undefined,
): PeriodBounds | undefined {
  if (periodFilter === undefined) {
    return periodBounds;
  }
  if (periodFilter.filterType === "custom") {
    return periodFilter;
  }
  if (periodBounds === undefined) {
    return undefined;
  }
  if (periodBounds.periodOption === "year") {
    const max = periodBounds.max;
    const min = max;
    return {
      periodOption: "year",
      min,
      max,
    };
  }

  // TODO: Calendar-based filters are hidden in UI for quarter_id data (see _2_filters.tsx:236-250).
  // This code path is unreachable. Either implement the feature or remove this block.
  if (
    periodBounds.periodOption === "quarter_id" &&
    (periodFilter.filterType === "last_calendar_year" ||
      periodFilter.filterType === "last_calendar_quarter" ||
      periodFilter.filterType === "last_n_calendar_years" ||
      periodFilter.filterType === "last_n_calendar_quarters")
  ) {
    return periodBounds;
  }

  if (periodFilter.filterType === "last_n_months") {
    const nMonths = periodFilter.nMonths;
    if (nMonths < 1 || nMonths > 24) {
      throw new Error(`nMonths must be between 1 and 24, got ${nMonths}`);
    }
    const time = getTimeFromPeriodId(periodBounds.max, "year-month");
    const min = getPeriodIdFromTime(time - (nMonths - 1), "year-month");
    return {
      periodOption: periodBounds.periodOption,
      min,
      max: periodBounds.max,
    };
  }
  if (periodFilter.filterType === "from_month") {
    return {
      periodOption: periodBounds.periodOption,
      min: periodFilter.min,
      max: periodBounds.max,
    };
  }
  if (
    periodFilter.filterType === "last_calendar_year" ||
    periodFilter.filterType === "last_n_calendar_years"
  ) {
    const bounds = getLastFullYearBounds(periodBounds);
    const nYears = periodFilter.filterType === "last_n_calendar_years"
      ? (periodFilter.nYears ?? 1)
      : 1;
    if (nYears < 1 || nYears > 10) {
      throw new Error(`nYears must be between 1 and 10, got ${nYears}`);
    }
    if (nYears === 1) {
      return { periodOption: periodBounds.periodOption, ...bounds };
    }
    const startTime = getTimeFromPeriodId(bounds.min, "year-month");
    const extendedMin = getPeriodIdFromTime(startTime - (nYears - 1) * 12, "year-month");
    return {
      periodOption: periodBounds.periodOption,
      min: extendedMin,
      max: bounds.max,
    };
  }
  if (
    periodFilter.filterType === "last_calendar_quarter" ||
    periodFilter.filterType === "last_n_calendar_quarters"
  ) {
    const bounds = getLastFullQuarterBounds(periodBounds);
    const nQuarters = periodFilter.filterType === "last_n_calendar_quarters"
      ? (periodFilter.nQuarters ?? 1)
      : 1;
    if (nQuarters < 1 || nQuarters > 20) {
      throw new Error(`nQuarters must be between 1 and 20, got ${nQuarters}`);
    }
    if (nQuarters === 1) {
      return { periodOption: periodBounds.periodOption, ...bounds };
    }
    const startTime = getTimeFromPeriodId(bounds.min, "year-month");
    const extendedMin = getPeriodIdFromTime(startTime - (nQuarters - 1) * 3, "year-month");
    return {
      periodOption: periodBounds.periodOption,
      min: extendedMin,
      max: bounds.max,
    };
  }
  throw new Error("Should not happen");
}

function getLastFullYearBounds(periodBounds: PeriodBounds): { min: number; max: number } {
  if (getCalendar() === "ethiopian") {
    if (
      periodBounds.max.toFixed(0).endsWith("10") ||
      periodBounds.max.toFixed(0).endsWith("11") ||
      periodBounds.max.toFixed(0).endsWith("12")
    ) {
      const minYear = Math.floor(periodBounds.max / 100) - 1;
      return { min: minYear * 100 + 11, max: (minYear + 1) * 100 + 10 };
    }
    const minYear = Math.floor(periodBounds.max / 100) - 2;
    return { min: minYear * 100 + 11, max: (minYear + 1) * 100 + 10 };
  }
  if (periodBounds.max.toFixed(0).endsWith("12")) {
    const minYear = Math.floor(periodBounds.max / 100);
    return { min: minYear * 100 + 1, max: minYear * 100 + 12 };
  }
  const minYear = Math.floor(periodBounds.max / 100) - 1;
  return { min: minYear * 100 + 1, max: minYear * 100 + 12 };
}

function getLastFullQuarterBounds(periodBounds: PeriodBounds): { min: number; max: number } {
  if (getCalendar() === "ethiopian") {
    const maxMonth = periodBounds.max % 100;
    const maxYear = Math.floor(periodBounds.max / 100);
    if (maxMonth >= 11 || maxMonth <= 1) {
      const quarterYear = maxMonth === 1 ? maxYear - 1 : maxYear - 1;
      return { min: quarterYear * 100 + 8, max: quarterYear * 100 + 10 };
    } else if (maxMonth >= 2 && maxMonth <= 4) {
      return { min: (maxYear - 1) * 100 + 11, max: maxYear * 100 + 1 };
    } else if (maxMonth >= 5 && maxMonth <= 7) {
      return { min: maxYear * 100 + 2, max: maxYear * 100 + 4 };
    } else {
      return { min: maxYear * 100 + 5, max: maxYear * 100 + 7 };
    }
  }
  const maxMonth = periodBounds.max % 100;
  const maxYear = Math.floor(periodBounds.max / 100);
  if (maxMonth >= 1 && maxMonth <= 3) {
    return { min: (maxYear - 1) * 100 + 10, max: (maxYear - 1) * 100 + 12 };
  } else if (maxMonth >= 4 && maxMonth <= 6) {
    return { min: maxYear * 100 + 1, max: maxYear * 100 + 3 };
  } else if (maxMonth >= 7 && maxMonth <= 9) {
    return { min: maxYear * 100 + 4, max: maxYear * 100 + 6 };
  } else {
    return { min: maxYear * 100 + 7, max: maxYear * 100 + 9 };
  }
}

export function hashFetchConfig(fc: GenericLongFormFetchConfig): string {
  return [
    getSortedAlphabeticalByFunc(
      fc.values,
      (v: {
        prop: string;
        func: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "identity";
      }) => v.prop,
    )
      .map(
        (v: {
          prop: string;
          func: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "identity";
        }) => [v.func, v.prop].join("&"),
      )
      .join("$"),
    getSortedAlphabetical(fc.groupBys).join("$"),
    getSortedAlphabeticalByFunc(
      fc.filters,
      (v: { disOpt: DisaggregationOption; values: (string | number)[] }) => v.disOpt,
    )
      .map((f: { disOpt: DisaggregationOption; values: (string | number)[] }) =>
        [f.disOpt, getSortedAlphabetical(f.values.map(String)).join(",")].join("&"),
      )
      .join("$"),
    fc.periodFilter?.filterType ?? "",
    fc.periodFilter?.filterType === "last_n_months" ? fc.periodFilter.nMonths.toString() : "",
    fc.periodFilter?.filterType === "last_n_calendar_years" ? fc.periodFilter.nYears.toString() : "",
    fc.periodFilter?.filterType === "last_n_calendar_quarters" ? fc.periodFilter.nQuarters.toString() : "",
    fc.periodFilter && periodFilterHasBounds(fc.periodFilter) ? fc.periodFilter.periodOption : "",
    fc.periodFilter && periodFilterHasBounds(fc.periodFilter) ? fc.periodFilter.min.toString() : "",
    fc.periodFilter && periodFilterHasBounds(fc.periodFilter) ? fc.periodFilter.max.toString() : "",
    fc.postAggregationExpression ?? "",
    fc.includeNationalForAdminArea2 ? "yes" : "no",
    fc.includeNationalPosition,
  ].join("#");
}

export function getFilteredValueProps(
  valueProps: string[],
  config: PresentationObjectConfig,
) {
  const needsFilter =
    !!config.d.valuesFilter && config.d.valuesFilter.length > 0;
  return valueProps.filter((vp) => {
    return !needsFilter || config.d.valuesFilter?.includes(vp);
  });
}

export function hasOnlyOneFilteredValue(
  config: PresentationObjectConfig,
  disOpt: DisaggregationOption,
) {
  return (
    config.d.filterBy.find((fil) => fil.disOpt === disOpt)?.values.length === 1
  );
}

function getFiltersWithoutReplicant(config: PresentationObjectConfig): {
  disOpt: DisaggregationOption;
  values: (string | number)[];
}[] {
  return config.d.filterBy.filter((filter) => filter.values.length > 0);
}

function getFiltersWithReplicant(config: PresentationObjectConfig): {
  disOpt: DisaggregationOption;
  values: (string | number)[];
}[] {
  const filters = getFiltersWithoutReplicant(config);
  const prop = getReplicateByProp(config);
  if (prop === undefined) {
    return filters;
  }
  return [
    ...filters,
    {
      disOpt: prop,
      values: [config.d.selectedReplicantValue ?? "UNSELECTED"],
    },
  ];
}
