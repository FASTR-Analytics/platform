import {
  getPeriodIdFromTime,
  getSortedAlphabetical,
  getSortedAlphabeticalByFunc,
  getTimeFromPeriodId,
} from "@timroberton/panther";
import { getReplicateByProp } from "./get_disaggregator_display_prop.ts";
import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  PeriodBounds,
  PeriodFilter,
  type PeriodOption,
  PresentationObjectConfig,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
} from "./types/mod.ts";
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
    groupBys.push(config.d.periodOpt);
  }

  const shouldIncludeNationalAggregate = config.d.includeNationalForAdminArea2;
  const nationalAggregateIsAllowed = config.d.disaggregateBy.some((d) => {
    return d.disOpt === "admin_area_2" && d.disDisplayOpt !== "replicant";
  });
  const includeNationalForAdminArea2 = shouldIncludeNationalAggregate &&
    nationalAggregateIsAllowed;

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
  if (
    periodFilter.filterType === undefined ||
    periodFilter.filterType === "custom"
  ) {
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
  } else {
    if (periodFilter.filterType === "last_12_months") {
      const periodType =
        periodBounds.periodOption === "period_id"
          ? "year-month"
          : "year-quarter";
      const time = getTimeFromPeriodId(
        periodBounds.max,
        periodType,
      );
      const min = getPeriodIdFromTime(time - 11, periodType);
      return {
        periodOption: periodBounds.periodOption,
        min,
        max: periodBounds.max,
      };
    }
    if (periodFilter.filterType === "last_calendar_year") {
      if (getCalendar() === "ethiopian") {
        /////////////////////
        //                 //
        //    Ethiopian    //
        //                 //
        /////////////////////
        if (
          periodBounds.max.toFixed(0).endsWith("10") ||
          periodBounds.max.toFixed(0).endsWith("11") ||
          periodBounds.max.toFixed(0).endsWith("12")
        ) {
          const minYear = Math.floor(periodBounds.max / 100) -
            1;
          const min = minYear * 100 + 11;
          const max = (minYear + 1) * 100 + 10;
          return {
            periodOption: periodBounds.periodOption,
            min,
            max,
          };
        }
        const minYear = Math.floor(periodBounds.max / 100) - 2;
        const min = minYear * 100 + 11;
        const max = (minYear + 1) * 100 + 10;
        return {
          periodOption: periodBounds.periodOption,
          min,
          max,
        };
      }
      /////////////////////
      //                 //
      //    Gregorian    //
      //                 //
      /////////////////////
      if (periodBounds.max.toFixed(0).endsWith("12")) {
        const minYear = Math.floor(periodBounds.max / 100);
        const min = minYear * 100 + 1;
        const max = minYear * 100 + 12;
        return {
          periodOption: periodBounds.periodOption,
          min,
          max,
        };
      }
      const minYear = Math.floor(periodBounds.max / 100) - 1;
      const min = minYear * 100 + 1;
      const max = minYear * 100 + 12;
      return {
        periodOption: periodBounds.periodOption,
        min,
        max,
      };
    }
  }
  throw new Error("Should not happen");
}

export function hashFetchConfig(fc: GenericLongFormFetchConfig): string {
  return [
    getSortedAlphabeticalByFunc(fc.values, (v) => v.prop)
      .map((v) => [v.func, v.prop].join("&"))
      .join("$"),
    getSortedAlphabetical(fc.groupBys).join("$"),
    getSortedAlphabeticalByFunc(fc.filters, (v) => v.col)
      .map((f) =>
        [f.col, getSortedAlphabetical(f.vals.map(String)).join(",")].join("&")
      )
      .join("$"),
    fc.periodFilter?.filterType ?? "",
    fc.periodFilter?.periodOption ?? "",
    fc.periodFilter?.min?.toString() ?? "",
    fc.periodFilter?.max?.toString() ?? "",
    fc.postAggregationExpression ?? "",
    fc.includeNationalForAdminArea2 ? "yes" : "no",
    fc.includeNationalPosition,
  ].join("#");
}

export function getFilteredValueProps(
  valueProps: string[],
  config: PresentationObjectConfig,
) {
  const needsFilter = !!config.d.valuesFilter &&
    config.d.valuesFilter.length > 0;
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
  col: DisaggregationOption;
  vals: string[];
}[] {
  return config.d.filterBy
    .map((filter) => {
      return {
        col: filter.disOpt,
        vals: filter.values,
      };
    })
    .filter((filter) => filter.vals.length > 0);
}

function getFiltersWithReplicant(config: PresentationObjectConfig): {
  col: DisaggregationOption;
  vals: string[];
}[] {
  const filters = getFiltersWithoutReplicant(config);
  const prop = getReplicateByProp(config);
  if (prop === undefined) {
    return filters;
  }
  return [
    ...filters,
    {
      col: prop,
      vals: [config.d.selectedReplicantValue ?? "UNSELECTED"],
    },
  ];
}
