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
  isRollupDimension,
  isRollupEligibleResultsValue,
  type RollupDimension,
  type RollupEligibilityInputs,
} from "./rollup.ts";
import {
  getReplicateByProp,
  hasOnlyOneFilteredValue,
} from "./get_disaggregator_display_prop.ts";
import {
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  type PeriodBounds,
  type PeriodFilter,
  periodFilterHasBounds,
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

  // Collapsed dimension baked in client-side; the server obeys it — see
  // getEffectiveRollupDimension.
  const rollupDim = getEffectiveRollupDimension(resultsValue, config);

  const filters = options?.excludeReplicantFilter
    ? getFiltersWithoutReplicant(config)
    : getFiltersWithReplicant(config);

  // A catalog-evaluated metric (PLAN_1a §1.6): the wire carries the declared
  // ingredient columns, SUMmed; the server applies each indicator's own
  // expression to the aggregated row and returns one `value`. Structurally the
  // same wire/display split a PAE metric has, but DECLARED — and like that
  // path, valuesFilter never applies (the ingredients are not user-facing
  // props; the metric's valueProps are ["value"]).
  if (resultsValue.catalogExpressionEvaluation) {
    return {
      success: true,
      data: {
        values: resultsValue.catalogExpressionEvaluation.ingredientProps.map(
          (prop) => ({ prop, func: "SUM" as const }),
        ),
        postAggregationExpression: undefined,
        groupBys,
        filters,
        periodFilter: config.d.periodFilter,
        rollupDim,
      },
    };
  }

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
        rollupDim,
      },
    };
  }

  const values = getFilteredValueProps(resultsValue.valueProps, config).map(
    (vp) => {
      return { prop: vp, func: resultsValue.valueFunc };
    },
  );
  // A valuesFilter can name props the metric doesn't have (e.g. a config
  // re-pointed to a different metric), leaving the intersection empty. An
  // empty select list is never a valid query — without this guard the pg
  // builder emits syntax-invalid SQL while the run path returns a fake "ok"
  // with no value columns.
  if (values.length === 0) {
    return {
      success: false,
      err:
        `The visualization's value filter (${
          (config.d.valuesFilter ?? []).join(", ")
        }) matches none of this metric's values (${
          resultsValue.valueProps.join(", ")
        })`,
    };
  }

  return {
    success: true,
    data: {
      values,
      postAggregationExpression: undefined,
      groupBys,
      filters,
      periodFilter: config.d.periodFilter,
      rollupDim,
    },
  };
}

// Re-express a period value in `fmt`, anchored to the start of its year when the
// source format differs (the finest alignment we can honor). Used to keep both
// bounds the same self-identified format; returns the value unchanged when already
// aligned or when the target format is unknown.
function reAnchorToFormat(
  value: number,
  fmt: PeriodOption | undefined,
): number {
  const src = inferPeriodFormatFromValue(value);
  if (fmt === undefined || src === fmt) {
    return value;
  }
  const year = src === "year"
    ? value
    : src === "quarter_id"
    ? Math.floor(value / 10)
    : Math.floor(value / 100);
  return fmt === "year"
    ? year
    : fmt === "quarter_id"
    ? year * 10 + 1
    : year * 100 + 1;
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
  // Year data: every non-custom filter collapses to the latest year. This is
  // the intended reading of every storable state — the UI offers year data
  // only "Last year" (stored as last_n_months) and "Custom", module presets
  // on annual metrics carry last_n_months/last_calendar_year meaning exactly
  // this, and the AI patch path rejects from_month for year granularity
  // (applyFigureConfigPatch). Ruled 2026-08-03, pinned by the rig's
  // hmis_yearly period-filter cases; a drift arrival (a filter authored under
  // a finer granularity surviving a module re-run to annual) also collapses
  // here rather than degrading to full bounds like the quarter_id block below
  // — acceptable because no module has ever changed a metric's granularity.
  if (fmt === "year") {
    const max = periodBounds.max;
    return { min: max, max };
  }

  // Calendar-based filter types are hidden in the UI for quarter_id data
  // (_2_filters.tsx), but this block is NOT dead and must not be deleted. A
  // config saved while the metric held period_id data still carries one after a
  // module re-run switches the table to quarter_id, and AI/hand-crafted configs
  // are not bound by the UI at all. Returning the raw bounds degrades to "no
  // period filter" — all data, which is the safe reading.
  //
  // Deleting it drops through to getLastFullYearBounds / getLastFullQuarterBounds,
  // whose YYYYMM math on a YYYYQ value turns max 20244 into {20101, 20112} — a
  // range no quarter_id row can match, so "show everything" silently becomes
  // no_data_available. Verified by execution 2026-07-26.
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
    const extendedMin = getPeriodIdFromTime(
      startTime - (nYears - 1) * 12,
      "year-month",
    );
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
    const extendedMin = getPeriodIdFromTime(
      startTime - (nQuarters - 1) * 3,
      "year-month",
    );
    return { min: extendedMin, max: bounds.max };
  }
  throw new Error("Should not happen");
}

function getLastFullYearBounds(
  periodBounds: PeriodBounds,
): { min: number; max: number } {
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

function getLastFullQuarterBounds(
  periodBounds: PeriodBounds,
): { min: number; max: number } {
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

// Cache-uniqueness identity for a fetch config, on BOTH tiers (Valkey
// po_items/replicant_opts and the client IndexedDB twins) — server and client
// must stay byte-identical. Arrays are sorted so semantically-equal configs
// hash equally: the values sort key includes func (prop alone left
// same-prop/different-func pairs order-unstable), and filter values are
// JSON-encoded (a bare ","-join let ["a,b"] collide with ["a","b"]).
export function hashFetchConfig(fc: GenericLongFormFetchConfig): string {
  return [
    getSortedAlphabeticalByFunc(
      fc.values,
      (v: {
        prop: string;
        func: "SUM" | "AVG" | "COUNT" | "MIN" | "MAX" | "identity";
      }) => [v.prop, v.func].join("&"),
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
      (v: { disOpt: DisaggregationOption; values: (string | number)[] }) =>
        v.disOpt,
    )
      .map((f: { disOpt: DisaggregationOption; values: (string | number)[] }) =>
        [f.disOpt, JSON.stringify(getSortedAlphabetical(f.values.map(String)))]
          .join("&")
      )
      .join("$"),
    fc.periodFilter?.filterType ?? "",
    fc.periodFilter?.filterType === "last_n_months"
      ? fc.periodFilter.nMonths.toString()
      : "",
    fc.periodFilter?.filterType === "last_n_calendar_years"
      ? fc.periodFilter.nYears.toString()
      : "",
    fc.periodFilter?.filterType === "last_n_calendar_quarters"
      ? fc.periodFilter.nQuarters.toString()
      : "",
    fc.periodFilter && periodFilterHasBounds(fc.periodFilter)
      ? fc.periodFilter.min.toString()
      : "",
    fc.periodFilter && periodFilterHasBounds(fc.periodFilter)
      ? fc.periodFilter.max.toString()
      : "",
    fc.postAggregationExpression ?? "",
    fc.rollupDim ?? "",
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

// Whether an entry could carry the roll-up flag as the config stands: a
// whitelisted dimension, NOT displayed as replicant/mapArea, NOT filtered to a
// single value, and not on a map (a "National" pane is not wanted) or a pie
// (a total slice inside its own parts would double the whole). Shared by
// the gate below and the editor (which shows the checkbox on every candidate
// dimension).
export function isRollupCandidateDimension(
  config: PresentationObjectConfig,
  entry: PresentationObjectConfig["d"]["disaggregateBy"][number],
): boolean {
  return (
    config.d.type !== "map" &&
    config.d.type !== "pie" &&
    isRollupDimension(entry.disOpt) &&
    entry.disDisplayOpt !== "replicant" &&
    entry.disDisplayOpt !== "mapArea" &&
    !hasOnlyOneFilteredValue(config, entry.disOpt)
  );
}

// The single dimension the roll-up collapses, or undefined if the roll-up
// isn't active. The flag lives on the disaggregateBy entry (`rollup: true`);
// EXACTLY ONE flagged entry must pass isRollupCandidateDimension — more than
// one would require cross-product subtotals (2^n union branches), which is
// deliberately not built; the schema still allows multiple flags so lifting
// that limit later needs no storage migration. This is the single source of
// truth for the config-shape gate: the server collapse (via the baked
// `rollupDim`), the display label, and the axis pins all derive from it — the
// server must NOT recompute the dimension from raw groupBys (those include
// replicant levels, the wrong collapse target). Metric eligibility is layered
// on top by getEffectiveRollupDimension.
export function getRollupDimension(
  config: PresentationObjectConfig,
): RollupDimension | undefined {
  const flagged = config.d.disaggregateBy.flatMap((d) =>
    d.rollup === true && isRollupCandidateDimension(config, d)
      ? [d.disOpt as RollupDimension]
      : []
  );
  return flagged.length === 1 ? flagged[0] : undefined;
}

// getRollupDimension plus metric eligibility (isRollupEligibleResultsValue):
// the gate used everywhere a ResultsValue is in scope — the UI checkbox, the
// fetch-config builder, the save-time strip, and the AI editor tool.
export function getEffectiveRollupDimension(
  resultsValue: RollupEligibilityInputs,
  config: PresentationObjectConfig,
): RollupDimension | undefined {
  return isRollupEligibleResultsValue(resultsValue)
    ? getRollupDimension(config)
    : undefined;
}

// Whether a config's figure can contain roll-up sentinel rows: a flagged entry
// passes the config-shape gate. Display-side gate (no ResultsValue):
// metric-ineligible configs with a stale flag get no sentinel rows from the
// server, so display consumers of this remain inert for them.
export function isRollupActive(config: PresentationObjectConfig): boolean {
  return getRollupDimension(config) !== undefined;
}

// The roll-up row's display position — from the flagged entry; display-only,
// never in the fetch config or the cache hash.
export function getRollupPosition(
  config: PresentationObjectConfig,
): "top" | "bottom" {
  const dim = getRollupDimension(config);
  const entry = dim
    ? config.d.disaggregateBy.find((d) => d.disOpt === dim && d.rollup === true)
    : undefined;
  return entry?.rollupPosition ?? "bottom";
}

export type RollupLabelContext =
  | { kind: "pinned"; level: AdminLevel; value: string | undefined }
  | { kind: "national" }
  | { kind: "all_facilities" };

// What the roll-up row's scope actually is, for labeling (row label + editor
// checkbox), for a GIVEN dimension — the editor labels the checkbox of every
// candidate dimension, not just the flagged one. Admin precedence:
// 1. pinned ("{Area} — All areas") — the FINEST coarser level pinned to one
//    value (replicant or single-value filter) names the row.
// 2. national.
// Facility dimensions are always "all_facilities".
// FILTERS NEVER CHANGE THE LABEL (Tim 2026-07-28 — this removed an earlier
// "All selected areas/facilities" subset kind): a filter is the AUTHOR's
// context, not the READER's; the row states the figure's scope, and the
// reader of a report filtered to some areas or facility types reads the total
// row as the total of what the figure shows.
export function getRollupLabelContextForDimension(
  config: PresentationObjectConfig,
  dim: RollupDimension,
): RollupLabelContext {
  if (!isAdminLevel(dim)) {
    return { kind: "all_facilities" };
  }
  const level = dim;
  const levelIdx = ADMIN_LEVELS.indexOf(level);
  const coarser = ADMIN_LEVELS.slice(0, levelIdx);
  for (let i = coarser.length - 1; i >= 0; i--) {
    const l = coarser[i];
    const dis = config.d.disaggregateBy.find((d) => d.disOpt === l);
    if (dis?.disDisplayOpt === "replicant") {
      return {
        kind: "pinned",
        level: l,
        value: config.d.selectedReplicantValue,
      };
    }
    const filter = config.d.filterBy.find((f) => f.disOpt === l);
    if (filter?.values.length === 1) {
      return { kind: "pinned", level: l, value: String(filter.values[0]) };
    }
  }
  return { kind: "national" };
}

// Label context for the ACTIVE roll-up dimension, or undefined when none.
export function getRollupLabelContext(
  config: PresentationObjectConfig,
): RollupLabelContext | undefined {
  const dim = getRollupDimension(config);
  return dim === undefined
    ? undefined
    : getRollupLabelContextForDimension(config, dim);
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
