import { ADMIN_LEVELS, type AdminLevel } from "./rollup.ts";
import { deriveConfigFromVizPreset } from "./derive_default_visualizations.ts";
import { getDisaggregationAllowedPresentationOptions } from "./disaggregation_labels.ts";
import {
  EXPLORE_LEVELS,
  type ExploreAxis,
  type ExploreLevel,
  type ExploreViewBinding,
  type ExploreViewType,
  type ExploreViewTypeId,
  readyMetric,
} from "./explore_views.ts";
import { type Language, t3, type TranslatableString } from "./translate/mod.ts";
import type { DatasetType } from "./types/datasets.ts";
import type {
  DisaggregationDisplayOption,
  PeriodFilter,
  PeriodOption,
} from "./types/_metric_installed.ts";
import type { MetricWithStatus } from "./types/modules.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
} from "./types/presentation_object_defaults.ts";
import type {
  DisaggregationOption,
  DisaggregationPossibleValuesStatus,
} from "./types/presentation_objects.ts";
import type { RunAuthoringContext } from "./types/run_authoring_context.ts";

// The Explore page's query model (SYSTEM_11 "Explore query model"): the
// family query and the view choices the page holds, and the pure resolution
// of a binding under them into one view and one figure config. Nothing here
// rewrites what the user chose: state keeps intent, every read resolves it.

export type ExploreGrain = PeriodOption;

// `values: []` is every time point or year (for months, every month).
export type ExplorePeriod =
  | { kind: "window"; filter: NonNullable<PeriodFilter> }
  | { kind: "values"; values: string[] };

// Shared by every view of a family. `level` is absent until chosen, so it
// opens at the shallowest offered. `indicators: []` is every indicator.
export type FamilyQuery = {
  level?: ExploreLevel;
  indicators: string[];
  period: ExplorePeriod;
  grain: ExploreGrain;
};

// One view's own selections: its switch option, one value per pinned
// dimension, and its category values when the category is not the family's
// indicator dimension.
export type ViewChoices = {
  switch?: string;
  pinned: Partial<Record<DisaggregationOption, string>>;
  category?: string[];
};

// The active metric's possible values under the scope, as the metric info
// serves them; HFA time points in the instance's declared order.
export type ExplorePossibleValues = {
  [key in DisaggregationOption]?: DisaggregationPossibleValuesStatus;
};

export const INDICATOR_DIMENSION: Record<DatasetType, DisaggregationOption> = {
  hmis: "indicator_common_id",
  hfa: "hfa_indicator",
  iceh: "iceh_indicator",
};

export type ExploreOption = { id: string; label: string };

export type ExplorePlacement = "laid_out" | "pinned" | "dropped";

export type ExploreTimeColumn = PeriodOption | "time_point";

export type ExplorePeriodChoice = {
  id: string;
  label: string;
  period: ExplorePeriod;
};

// A dimension read at one value. `replicant` says how it enters the config:
// as the replicant when the metric requires it and it is not time-based, as
// a filter otherwise. `pending` is a dimension whose values are not served
// yet; `too_many_values` is the server's cap.
export type ExplorePin = {
  dimension: DisaggregationOption;
  role: "area" | "unit" | "category" | "facet";
  status: "ok" | "too_many_values" | "no_values" | "pending";
  options: ExploreOption[];
  value: string | undefined;
  replicant: boolean;
};

export type ResolvedView = {
  binding: ExploreViewBinding;
  type: ExploreViewType;
  family: DatasetType;
  metric: MetricWithStatus;
  // The family query as this view reads it: the level and period resolved,
  // the indicators the package knows.
  query: FamilyQuery;
  droppedIndicators: string[];
  switch:
    | { value: string; options: { id: string; label: TranslatableString }[] }
    | undefined;
  // The level select's role: absent when the view has no area role, or the
  // active type drops it and the level does not choose the metric.
  // `dimension` is the metric's admin dimension at the level, undefined at
  // national; `levels` are the offered levels, shallowest first.
  area:
    | {
      placement: ExplorePlacement;
      level: ExploreLevel;
      levels: ExploreLevel[];
      dimension: AdminLevel | undefined;
      byLevel: boolean;
    }
    | undefined;
  unit:
    | { dimension: DisaggregationOption; placement: "laid_out" | "pinned" }
    | undefined;
  // Laid out: `values` are the chosen ids among the options and feed a
  // multi-select. Pinned: the value is the category's pin.
  category:
    | {
      dimension: DisaggregationOption;
      placement: "laid_out" | "pinned";
      isIndicator: boolean;
      options: ExploreOption[];
      values: string[];
    }
    | undefined;
  time:
    | {
      column: ExploreTimeColumn;
      kind: "months" | "values";
      placement: "laid_out" | "pinned";
      choices: ExplorePeriodChoice[];
      grainShown: boolean;
    }
    | undefined;
  // Every pinned dimension in toolbar order: area, facets, unit, category.
  pins: ExplorePin[];
};

export type ResolveViewInput = {
  binding: ExploreViewBinding;
  family: DatasetType;
  type: string | undefined;
  query: FamilyQuery | undefined;
  choices: ViewChoices | undefined;
  scopeArea: string | null;
  ctx: RunAuthoringContext;
  possibleValues: ExplorePossibleValues;
};

function scopeDepth(scopeArea: string | null): number {
  return scopeArea === null ? 1 : 2;
}

function levelDepth(level: ExploreLevel): number {
  return level === "national" ? 1 : ADMIN_LEVELS.indexOf(level) + 2;
}

function laysOut(type: ExploreViewType, axis: ExploreAxis): boolean {
  switch (type.type) {
    case "table":
      return type.rows === axis || type.cols === axis;
    case "timeseries":
      return axis === "time" || axis === "category" ||
        (axis === "unit" && type.series === "unit");
    case "chart":
      return type.axis === axis || (axis === "unit" && type.series === "unit");
    case "map":
      return axis === "area";
  }
}

function carries(metric: MetricWithStatus, dim: DisaggregationOption): boolean {
  return metric.disaggregationOptions.some((d) => d.value === dim);
}

function isReplicant(
  metric: MetricWithStatus,
  dim: DisaggregationOption,
): boolean {
  return metric.disaggregationOptions.some((d) =>
    d.value === dim && d.isRequired
  ) && getDisaggregationAllowedPresentationOptions(dim) === undefined;
}

// R10: a level is offered when it is deeper than the scope's area while the
// area is laid out, deeper or equal while it is pinned; national only under
// no scope area. For a `byLevel` metric the candidates are its keys whose
// metric is ready; otherwise the admin dimensions the metric carries.
function offeredLevels(
  binding: ExploreViewBinding,
  candidate: MetricWithStatus | undefined,
  areaLaidOut: boolean,
  scopeArea: string | null,
  ctx: RunAuthoringContext,
): ExploreLevel[] {
  const minDepth = scopeDepth(scopeArea) + (areaLaidOut ? 1 : 0);
  const metric = binding.metric;
  const carried: ExploreLevel[] = "byLevel" in metric
    ? EXPLORE_LEVELS.filter((level) => {
      const id = metric.byLevel[level];
      return id !== undefined && readyMetric(ctx, id) !== undefined;
    })
    : ADMIN_LEVELS.filter((level) =>
      candidate !== undefined && carries(candidate, level)
    );
  return carried.filter((level) => levelDepth(level) >= minDepth);
}

function familyDictionary(
  family: DatasetType,
  ctx: RunAuthoringContext,
): ExploreOption[] {
  switch (family) {
    case "hmis":
      return ctx.hmisIndicators.map((i) => ({ id: i.id, label: i.label }));
    case "hfa":
      return ctx.hfaTaxonomy.indicators.map((i) => ({
        id: i.id,
        label: i.label,
      }));
    case "iceh":
      return ctx.icehIndicators.map((i) => ({ id: i.id, label: i.label }));
  }
}

function servedValues(
  possibleValues: ExplorePossibleValues,
  dim: DisaggregationOption,
): ExploreOption[] {
  const status = possibleValues[dim];
  return status?.status === "ok" ? status.values : [];
}

// The dictionary for an indicator dimension, the possible values otherwise.
// R16: a pinned `hfa_category` facet narrows the HFA indicators to its own.
function categoryOptions(
  dim: DisaggregationOption,
  family: DatasetType,
  ctx: RunAuthoringContext,
  possibleValues: ExplorePossibleValues,
  facets: ExplorePin[],
): ExploreOption[] {
  if (dim === "hfa_indicator") {
    const category = facets.find((f) => f.dimension === "hfa_category")?.value;
    return ctx.hfaTaxonomy.indicators
      .filter((i) => category === undefined || i.categoryId === category)
      .map((i) => ({ id: i.id, label: i.label }));
  }
  return dim === INDICATOR_DIMENSION[family]
    ? familyDictionary(family, ctx)
    : servedValues(possibleValues, dim);
}

function resolvePin(args: {
  dimension: DisaggregationOption;
  role: ExplorePin["role"];
  metric: MetricWithStatus;
  chosen: string | undefined;
  options: ExploreOption[] | undefined;
  possibleValues: ExplorePossibleValues;
}): ExplorePin {
  const served = args.possibleValues[args.dimension];
  const options = args.options ??
    servedValues(args.possibleValues, args.dimension);
  const status: ExplorePin["status"] = args.options !== undefined
    ? (options.length > 0 ? "ok" : "no_values")
    : served === undefined
    ? "pending"
    : served.status === "ok"
    ? "ok"
    : served.status === "too_many_values"
    ? "too_many_values"
    : "no_values";
  const value = args.chosen !== undefined &&
      options.some((o) => o.id === args.chosen)
    ? args.chosen
    : options[0]?.id;
  return {
    dimension: args.dimension,
    role: args.role,
    status,
    options,
    value,
    replicant: isReplicant(args.metric, args.dimension),
  };
}

// The metric's time column: the most granular period column for HMIS,
// time_point for HFA, year for ICEH; none when the metric lacks it.
function timeColumnFor(
  family: DatasetType,
  metric: MetricWithStatus,
): ExploreTimeColumn | undefined {
  const column: ExploreTimeColumn | undefined = family === "hmis"
    ? metric.mostGranularTimePeriodColumnInResultsFile
    : family === "hfa"
    ? "time_point"
    : "year";
  return column !== undefined && carries(metric, column) ? column : undefined;
}

// Years and time points in chronological order, the latest last: years by
// number, time points as served (the instance's declared order).
function timeValues(
  possibleValues: ExplorePossibleValues,
  column: ExploreTimeColumn,
): string[] {
  const ids = servedValues(possibleValues, column).map((v) => v.id);
  return column === "year"
    ? ids.toSorted((a, b) => Number(a) - Number(b))
    : ids;
}

// Months offer windows; years and time points their values, newest first,
// and "All" only where every value is readable at once: laid out.
export function periodChoicesFor(
  kind: "months" | "values",
  laidOut: boolean,
  values: string[],
): ExplorePeriodChoice[] {
  const all: ExplorePeriodChoice = {
    id: "all",
    label: t3({ en: "All", fr: "Tout", pt: "Tudo" }),
    period: { kind: "values", values: [] },
  };
  if (kind === "months") {
    return [
      {
        id: "last_12_months",
        label: t3({
          en: "Last 12 months",
          fr: "12 derniers mois",
          pt: "Últimos 12 meses",
        }),
        period: {
          kind: "window",
          filter: { filterType: "last_n_months", nMonths: 12 },
        },
      },
      {
        id: "last_quarter",
        label: t3({
          en: "Last quarter",
          fr: "Dernier trimestre",
          pt: "Último trimestre",
        }),
        period: {
          kind: "window",
          filter: { filterType: "last_calendar_quarter" },
        },
      },
      {
        id: "last_year",
        label: t3({
          en: "Last year",
          fr: "Dernière année",
          pt: "Último ano",
        }),
        period: {
          kind: "window",
          filter: { filterType: "last_calendar_year" },
        },
      },
      all,
    ];
  }
  const singles = values.toReversed().map((value): ExplorePeriodChoice => ({
    id: value,
    label: value,
    period: { kind: "values", values: [value] },
  }));
  return laidOut ? [...singles, all] : singles;
}

export function periodChoiceId(
  period: ExplorePeriod,
  choices: ExplorePeriodChoice[],
): string | undefined {
  const key = JSON.stringify(period);
  return choices.find((c) => JSON.stringify(c.period) === key)?.id;
}

// R9: months take the family window laid out or pinned; years and time
// points take the chosen values laid out (none meaning all), and pinned the
// latest chosen, else the latest available.
function resolvePeriod(
  wanted: ExplorePeriod,
  kind: "months" | "values",
  laidOut: boolean,
  values: string[],
): ExplorePeriod {
  if (kind === "months") {
    return wanted.kind === "window" ? wanted : { kind: "values", values: [] };
  }
  const chosen = values.filter((v) =>
    wanted.kind === "values" && wanted.values.includes(v)
  );
  if (laidOut) return { kind: "values", values: chosen };
  const latest = chosen.at(-1) ?? values.at(-1);
  return { kind: "values", values: latest === undefined ? [] : [latest] };
}

// A quarterly table cannot be read by month.
function resolveGrain(
  grain: ExploreGrain,
  column: ExploreTimeColumn | undefined,
): ExploreGrain {
  return column === "quarter_id" && grain === "period_id"
    ? "quarter_id"
    : grain;
}

// The binding under the chosen type, the family query, the view choices and
// the scope, as the package can answer it. Undefined when no option of the
// binding's metric is ready. The metric does not depend on the possible
// values, so a caller reads it first with none, then resolves again with the
// metric's own.
export function resolveView(input: ResolveViewInput): ResolvedView | undefined {
  const { binding, family, query, choices, scopeArea, ctx, possibleValues } =
    input;
  const type = binding.types.find((t) => t.type === input.type) ??
    binding.types[0];
  if (type === undefined) return undefined;

  const metricBinding = binding.metric;
  const switchOptions = "switch" in metricBinding
    ? metricBinding.switch.options.filter((o) =>
      readyMetric(ctx, o.metricId) !== undefined
    )
    : [];
  const switchValue = choices?.switch !== undefined &&
      switchOptions.some((o) => o.id === choices.switch)
    ? choices.switch
    : switchOptions[0]?.id;
  const candidate = "id" in metricBinding
    ? readyMetric(ctx, metricBinding.id)
    : "switch" in metricBinding
    ? (switchValue === undefined ? undefined : readyMetric(
      ctx,
      switchOptions.find((o) => o.id === switchValue)?.metricId ?? "",
    ))
    : undefined;

  const hasArea = "byLevel" in metricBinding ||
    binding.types.some((t) => laysOut(t, "area"));
  const areaLaidOut = laysOut(type, "area");
  const levels = hasArea
    ? offeredLevels(binding, candidate, areaLaidOut, scopeArea, ctx)
    : [];
  const level = query?.level !== undefined && levels.includes(query.level)
    ? query.level
    : levels[0];
  const metric = "byLevel" in metricBinding
    ? (level === undefined ? undefined : readyMetric(
      ctx,
      metricBinding.byLevel[level] ?? "",
    ))
    : candidate;
  if (metric === undefined) return undefined;

  const areaDimension = level === undefined || level === "national" ||
      !carries(metric, level)
    ? undefined
    : level;
  const byLevel = "byLevel" in metricBinding;
  const placement: ExplorePlacement = areaLaidOut
    ? "laid_out"
    : areaDimension !== undefined && isReplicant(metric, areaDimension)
    ? "pinned"
    : "dropped";
  const area: ResolvedView["area"] =
    hasArea && level !== undefined && (byLevel || placement !== "dropped")
      ? { placement, level, levels, dimension: areaDimension, byLevel }
      : undefined;

  const pinned = choices?.pinned ?? {};
  const pins: ExplorePin[] = [];
  if (area?.placement === "pinned" && area.dimension !== undefined) {
    pins.push(resolvePin({
      dimension: area.dimension,
      role: "area",
      metric,
      chosen: pinned[area.dimension],
      options: undefined,
      possibleValues,
    }));
  }
  const facets = (binding.facets ?? []).map((dimension) =>
    resolvePin({
      dimension,
      role: "facet",
      metric,
      chosen: pinned[dimension],
      options: undefined,
      possibleValues,
    })
  );
  pins.push(...facets);

  const unit: ResolvedView["unit"] = binding.unit === undefined ? undefined : {
    dimension: binding.unit,
    placement: laysOut(type, "unit") ? "laid_out" : "pinned",
  };
  if (unit?.placement === "pinned") {
    pins.push(resolvePin({
      dimension: unit.dimension,
      role: "unit",
      metric,
      chosen: pinned[unit.dimension],
      options: undefined,
      possibleValues,
    }));
  }

  const dictionary = new Set(familyDictionary(family, ctx).map((o) => o.id));
  const indicators = (query?.indicators ?? []).filter((id) =>
    dictionary.has(id)
  );
  const droppedIndicators = (query?.indicators ?? []).filter((id) =>
    !dictionary.has(id)
  );
  let category: ResolvedView["category"];
  if (binding.category !== undefined) {
    const dimension = binding.category;
    const isIndicator = dimension === INDICATOR_DIMENSION[family];
    const options = categoryOptions(
      dimension,
      family,
      ctx,
      possibleValues,
      facets,
    );
    const laidOut = laysOut(type, "category");
    if (laidOut) {
      const chosen = isIndicator ? indicators : (choices?.category ?? []);
      const offered = new Set(options.map((o) => o.id));
      category = {
        dimension,
        placement: "laid_out",
        isIndicator,
        options,
        values: chosen.filter((id) => offered.has(id)),
      };
    } else {
      pins.push(resolvePin({
        dimension,
        role: "category",
        metric,
        chosen: pinned[dimension],
        options,
        possibleValues,
      }));
      category = {
        dimension,
        placement: "pinned",
        isIndicator,
        options,
        values: [],
      };
    }
  }

  const column = timeColumnFor(family, metric);
  const grain = resolveGrain(query?.grain ?? "period_id", column);
  const wantedPeriod: ExplorePeriod = query?.period ??
    { kind: "values", values: [] };
  let time: ResolvedView["time"];
  let period = wantedPeriod;
  if (column !== undefined) {
    const kind = column === "year" || column === "time_point"
      ? "values"
      : "months";
    const laidOut = laysOut(type, "time");
    const values = kind === "values" ? timeValues(possibleValues, column) : [];
    period = resolvePeriod(wantedPeriod, kind, laidOut, values);
    time = {
      column,
      kind,
      placement: laidOut ? "laid_out" : "pinned",
      choices: periodChoicesFor(kind, laidOut, values),
      grainShown: kind === "months" && laidOut,
    };
  }

  const resolvedLevel = level ?? query?.level;
  return {
    binding,
    type,
    family,
    metric,
    query: {
      ...(resolvedLevel === undefined ? {} : { level: resolvedLevel }),
      indicators,
      period,
      grain,
    },
    droppedIndicators,
    switch: switchValue === undefined ? undefined : {
      value: switchValue,
      options: switchOptions.map((o) => ({ id: o.id, label: o.label })),
    },
    area,
    unit,
    category,
    time,
    pins,
  };
}

type DisaggregateByEntry = PresentationObjectConfig["d"]["disaggregateBy"][
  number
];
type FilterByEntry = PresentationObjectConfig["d"]["filterBy"][number];

export type DerivedConfig = {
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
};

function timeColumn(
  time: NonNullable<ResolvedView["time"]>,
  grain: ExploreGrain,
): ExploreTimeColumn {
  return time.kind === "months" ? grain : time.column;
}

function axisEntry(
  view: ResolvedView,
  axis: ExploreAxis,
  slot: DisaggregationDisplayOption,
): DisaggregateByEntry | undefined {
  switch (axis) {
    case "area":
      return view.area?.dimension === undefined ? undefined : {
        disOpt: view.area.dimension,
        disDisplayOpt: slot,
        ...(slot === "row" ? { rollup: true, rollupPosition: "top" } : {}),
      };
    case "unit":
      return view.unit === undefined
        ? undefined
        : { disOpt: view.unit.dimension, disDisplayOpt: slot };
    case "category":
      return view.category === undefined
        ? undefined
        : { disOpt: view.category.dimension, disDisplayOpt: slot };
    case "time":
      return view.time === undefined ? undefined : {
        disOpt: timeColumn(view.time, view.query.grain),
        disDisplayOpt: slot,
      };
    case "values":
      return undefined;
  }
}

// R5: the metric's first preset of the same type, else the defaults, with
// `cfMode: "indicator"` when the metric's format is the indicator's own.
function borrowedStyle(
  metric: MetricWithStatus,
  type: ExploreViewTypeId,
  language: Language,
): PresentationObjectConfig["s"] {
  const preset = metric.vizPresets?.find((p) => p.config.d.type === type);
  return preset !== undefined
    ? deriveConfigFromVizPreset(preset, language).s
    : {
      ...DEFAULT_S_CONFIG,
      ...(metric.formatAs === "indicator"
        ? { cfMode: "indicator" as const }
        : {}),
    };
}

// The figure config the resolved view reads: `d` derived from the type's
// layout (§2.3) and the pins, `s` borrowed by type, `t` empty since the
// view's name is the caption. Undefined while a pin has no value, over the
// cap, or when a pinned time has no period to read.
export function deriveViewConfig(
  view: ResolvedView,
  language: Language,
): DerivedConfig | undefined {
  const { type, metric } = view;
  if (view.pins.some((p) => p.value === undefined)) return undefined;

  const disaggregateBy: DisaggregateByEntry[] = [];
  const filterBy: FilterByEntry[] = [];
  const push = (entry: DisaggregateByEntry | undefined) => {
    if (entry !== undefined) disaggregateBy.push(entry);
  };
  let valuesDisDisplayOpt: DisaggregationDisplayOption;
  let timeseriesGrouping: PeriodOption | undefined;
  switch (type.type) {
    case "table":
      valuesDisDisplayOpt = type.rows === "values" ? "row" : "col";
      push(axisEntry(view, type.rows, "row"));
      push(axisEntry(view, type.cols, "col"));
      break;
    case "timeseries": {
      valuesDisDisplayOpt = type.series === "unit" ? "col" : "series";
      push(axisEntry(view, "category", "cell"));
      if (type.series === "unit") push(axisEntry(view, "unit", "series"));
      if (view.time === undefined) return undefined;
      const grouping = view.time.kind === "months"
        ? view.query.grain
        : view.time.column;
      if (grouping === "time_point") return undefined;
      timeseriesGrouping = grouping;
      break;
    }
    case "chart":
      valuesDisDisplayOpt = type.series === "unit" ? "col" : "series";
      push(axisEntry(view, type.axis, "indicator"));
      if (type.series === "unit") push(axisEntry(view, "unit", "series"));
      break;
    case "map":
      valuesDisDisplayOpt = "cell";
      push(axisEntry(view, "area", "mapArea"));
      break;
  }

  let selectedReplicantValue: string | undefined;
  for (const pin of view.pins) {
    if (pin.value === undefined) return undefined;
    if (pin.replicant) {
      disaggregateBy.push({
        disOpt: pin.dimension,
        disDisplayOpt: "replicant",
      });
      selectedReplicantValue = pin.value;
    } else {
      filterBy.push({ disOpt: pin.dimension, values: [pin.value] });
    }
  }
  if (
    view.category?.placement === "laid_out" && view.category.values.length > 0
  ) {
    filterBy.push({
      disOpt: view.category.dimension,
      values: view.category.values,
    });
  }

  let periodFilter: NonNullable<PeriodFilter> | undefined;
  const period = view.query.period;
  if (view.time !== undefined) {
    if (view.time.kind === "months") {
      periodFilter = period.kind === "window" ? period.filter : undefined;
    } else if (period.kind === "values" && period.values.length > 0) {
      filterBy.push({ disOpt: view.time.column, values: period.values });
    } else if (view.time.placement === "pinned") {
      return undefined;
    }
  }

  const values = type.values ?? metric.valueProps;
  const style = borrowedStyle(metric, type.type, language);
  const s: PresentationObjectConfig["s"] = type.type === "timeseries"
    ? {
      ...style,
      content: "lines",
      hideLegend: type.series !== "unit" && values.length === 1,
    }
    : style;

  return {
    metric,
    config: {
      d: {
        type: type.type,
        valuesDisDisplayOpt,
        disaggregateBy,
        filterBy,
        ...(type.values === undefined ? {} : { valuesFilter: type.values }),
        ...(timeseriesGrouping === undefined ? {} : { timeseriesGrouping }),
        ...(periodFilter === undefined ? {} : { periodFilter }),
        ...(selectedReplicantValue === undefined
          ? {}
          : { selectedReplicantValue }),
      },
      s,
      t: DEFAULT_T_CONFIG,
    },
  };
}
