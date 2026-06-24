import {
  getPeriodIdFromTime,
  getSortedAlphabetical,
  getSortedAlphabeticalByFunc,
  getTimeFromPeriodId,
} from "@timroberton/panther";
import {
  ADMIN_LEVELS,
  type AdminLevel,
  isAdminLevel,
  isRollupEligibleResultsValue,
  type RollupEligibilityInputs,
} from "./admin_area_rollup.ts";
import { getReplicateByProp, hasOnlyOneFilteredValue } from "./get_disaggregator_display_prop.ts";
import {
  periodFilterHasBounds,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  type PeriodBounds,
  type PeriodFilter,
  type ResultsValueInfoForPresentationObject,
} from "./types/presentation_objects.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import {
  inferPeriodFormatFromValue,
  type PeriodOption,
} from "./types/_metric_installed.ts";
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

  // Collapse level baked in client-side; the server obeys it — see
  // getEffectiveRollupLevel.
  const rollupLevel = getEffectiveRollupLevel(resultsValue, config);
  const includeAdminAreaRollup =
    !!config.d.includeAdminAreaRollup && rollupLevel !== undefined;
  const adminAreaRollupLevel = includeAdminAreaRollup ? rollupLevel : undefined;

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
        includeAdminAreaRollup,
        adminAreaRollupLevel,
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
      includeAdminAreaRollup,
      adminAreaRollupLevel,
    },
  };
}

// Re-express a period value in `fmt`, anchored to the start of its year when the
// source format differs (the finest alignment we can honor). Used to keep both
// bounds the same self-identified format; returns the value unchanged when already
// aligned or when the target format is unknown.
function reAnchorToFormat(value: number, fmt: PeriodOption | undefined): number {
  const src = inferPeriodFormatFromValue(value);
  if (fmt === undefined || src === fmt) {
    return value;
  }
  const year = src === "year"
    ? value
    : src === "quarter_id"
    ? Math.floor(value / 10)
    : Math.floor(value / 100);
  return fmt === "year" ? year : fmt === "quarter_id" ? year * 10 + 1 : year * 100 + 1;
}

export function getPeriodFilterExactBounds(
  periodFilter: PeriodFilter | undefined,
  periodBounds: PeriodBounds | undefined,
): PeriodBounds | undefined {
  if (periodFilter === undefined) {
    return periodBounds;
  }
  if (periodFilter.filterType === "custom") {
    return { min: periodFilter.min, max: periodFilter.max };
  }
  if (periodBounds === undefined) {
    return undefined;
  }
  // The live data's format — bounds inherit it; the removed periodOption tag.
  const fmt = inferPeriodFormatFromValue(periodBounds.max);
  if (fmt === "year") {
    const max = periodBounds.max;
    return { min: max, max };
  }

  // TODO: Calendar-based filters are hidden in UI for quarter_id data (see _2_filters.tsx:236-250).
  // This code path is unreachable. Either implement the feature or remove this block.
  if (
    fmt === "quarter_id" &&
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
    return { min, max: periodBounds.max };
  }
  if (periodFilter.filterType === "from_month") {
    // Re-anchor a drifted stored min to the live data's format so both bounds
    // self-identify as the same format (otherwise the period column is ambiguous).
    const min = reAnchorToFormat(periodFilter.min, fmt);
    return { min, max: periodBounds.max };
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
      return { ...bounds };
    }
    const startTime = getTimeFromPeriodId(bounds.min, "year-month");
    const extendedMin = getPeriodIdFromTime(startTime - (nYears - 1) * 12, "year-month");
    return { min: extendedMin, max: bounds.max };
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
      return { ...bounds };
    }
    const startTime = getTimeFromPeriodId(bounds.min, "year-month");
    const extendedMin = getPeriodIdFromTime(startTime - (nQuarters - 1) * 3, "year-month");
    return { min: extendedMin, max: bounds.max };
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
    fc.periodFilter && periodFilterHasBounds(fc.periodFilter) ? fc.periodFilter.min.toString() : "",
    fc.periodFilter && periodFilterHasBounds(fc.periodFilter) ? fc.periodFilter.max.toString() : "",
    fc.postAggregationExpression ?? "",
    fc.includeAdminAreaRollup ? "yes" : "no",
    fc.adminAreaRollupLevel ?? "",
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


// The single admin level the roll-up collapses, or undefined if the roll-up isn't
// applicable. There must be EXACTLY ONE admin level that is grouped, NOT displayed
// as replicant/mapArea, and NOT filtered to a single value (more than one would
// require per-parent subtotals, which the display layer can't render). Maps are
// excluded entirely (a "National" pane is not wanted). This is the single source
// of truth for the config-shape gate: the server collapse (via the baked
// `adminAreaRollupLevel`), the display label, and the axis pins all derive from
// it — the server must NOT recompute the level from raw groupBys (those include
// replicant levels, the wrong collapse target). Metric eligibility is layered on
// top by getEffectiveRollupLevel.
export function getRollupAdminLevel(
  config: PresentationObjectConfig,
): AdminLevel | undefined {
  if (config.d.type === "map") {
    return undefined;
  }
  const effective = config.d.disaggregateBy.flatMap((d) =>
    isAdminLevel(d.disOpt) &&
    d.disDisplayOpt !== "replicant" &&
    d.disDisplayOpt !== "mapArea" &&
    !hasOnlyOneFilteredValue(config, d.disOpt)
      ? [d.disOpt]
      : [],
  );
  return effective.length === 1 ? effective[0] : undefined;
}

// getRollupAdminLevel plus metric eligibility (isRollupEligibleResultsValue):
// the gate used everywhere a ResultsValue is in scope — the UI checkbox, the
// fetch-config builder, the save-time strip, and the AI editor tool.
export function getEffectiveRollupLevel(
  resultsValue: RollupEligibilityInputs,
  config: PresentationObjectConfig,
): AdminLevel | undefined {
  return isRollupEligibleResultsValue(resultsValue)
    ? getRollupAdminLevel(config)
    : undefined;
}

// Whether a config's figure can contain roll-up sentinel rows: the flag is on
// AND the config-shape gate is open. Display-side gate (no ResultsValue):
// metric-ineligible configs with a stale flag get no sentinel rows from the
// server, so display consumers of this remain inert for them.
export function isRollupActive(config: PresentationObjectConfig): boolean {
  return (
    !!config.d.includeAdminAreaRollup &&
    getRollupAdminLevel(config) !== undefined
  );
}

export type RollupLabelContext =
  | { kind: "subset" }
  | { kind: "pinned"; level: AdminLevel; value: string | undefined }
  | { kind: "national" };

// What the roll-up row's scope actually is, for labeling (row label + editor
// checkbox). Precedence:
// 1. subset ("All selected areas") — an admin filter restricts the geography:
//    2+ values at or coarser than the roll-up level, or ANY values on a level
//    finer than it (finer filters subset the data even with one value).
//    Levels displayed as REPLICANT are skipped: their filter narrows which
//    panes exist, while the replicant pin (rule 2) governs each pane's data.
// 2. pinned ("{Area} — All areas") — the FINEST coarser level pinned to one
//    value (replicant or single-value filter) names the row.
// 3. national — no geographic restriction.
// Non-admin filters (facility type, indicator, ...) deliberately do not affect
// the label ("national among the selection" reading).
export function getRollupLabelContext(
  config: PresentationObjectConfig,
): RollupLabelContext | undefined {
  const level = getRollupAdminLevel(config);
  if (level === undefined) {
    return undefined;
  }
  const levelIdx = ADMIN_LEVELS.indexOf(level);
  const replicantLevels = new Set(
    config.d.disaggregateBy
      .filter((d) => d.disDisplayOpt === "replicant")
      .map((d) => d.disOpt),
  );
  for (const l of ADMIN_LEVELS) {
    if (replicantLevels.has(l)) {
      continue;
    }
    const filter = config.d.filterBy.find((f) => f.disOpt === l);
    if (!filter || filter.values.length === 0) {
      continue;
    }
    const minValuesForSubset = ADMIN_LEVELS.indexOf(l) <= levelIdx ? 2 : 1;
    if (filter.values.length >= minValuesForSubset) {
      return { kind: "subset" };
    }
  }
  const coarser = ADMIN_LEVELS.slice(0, levelIdx);
  for (let i = coarser.length - 1; i >= 0; i--) {
    const l = coarser[i];
    const dis = config.d.disaggregateBy.find((d) => d.disOpt === l);
    if (dis?.disDisplayOpt === "replicant") {
      return { kind: "pinned", level: l, value: config.d.selectedReplicantValue };
    }
    const filter = config.d.filterBy.find((f) => f.disOpt === l);
    if (filter?.values.length === 1) {
      return { kind: "pinned", level: l, value: String(filter.values[0]) };
    }
  }
  return { kind: "national" };
}

function getFiltersWithoutReplicant(config: PresentationObjectConfig): {
  disOpt: DisaggregationOption;
  values: (string | number)[];
}[] {
  return config.d.filterBy.filter((filter) => filter.values.length > 0);
}

export function getFiltersWithReplicant(config: PresentationObjectConfig): {
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
