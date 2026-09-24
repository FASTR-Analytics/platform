import { ADMIN_LEVELS, type AdminLevel } from "./rollup.ts";
import { deriveConfigFromVizPreset } from "./derive_default_visualizations.ts";
import { MODULE_FAMILY_ORDER } from "./group_metrics.ts";
import { t3, type Language } from "./translate/mod.ts";
import type { DatasetType } from "./types/datasets.ts";
import type { PeriodFilter } from "./types/_metric_installed.ts";
import type { MetricWithStatus } from "./types/modules.ts";
import type { VizPreset } from "./types/_metric_installed.ts";
import type { PresentationObjectConfig } from "./types/_presentation_object_config.ts";
import type { DisaggregationOption } from "./types/presentation_objects.ts";
import type { RunAuthoringContext } from "./types/run_authoring_context.ts";
import type { PackageScope } from "./types/scope.ts";

// The Explore Data table's controls' state (SYSTEM_11 "Grid query model").
// The columns mode is the view's and is passed beside it; the figure config
// is derived from both and never held.

export type GridColumns = "indicators" | "time";
export type GridGrain = "period_id" | "quarter_id" | "year";

export type GridUnit =
  | { kind: "admin"; level: AdminLevel }
  | { kind: "strat"; strat: string };

// `values: []` is every time point or year (for HMIS, every month).
export type GridPeriod =
  | { kind: "window"; filter: NonNullable<PeriodFilter> }
  | { kind: "values"; values: string[] };

// `indicators: []` is every indicator. `grain` is read only for HMIS over
// time: the table's Time mode and the timeseries.
export type GridQuery = {
  family: DatasetType;
  unit: GridUnit;
  indicators: string[];
  period: GridPeriod;
  grain: GridGrain;
};

// What the package offers beyond the authoring context, each list in
// chronological order so the latest is last.
export type GridAvailable = {
  hfaTimePoints: string[];
  icehYears: string[];
  icehStrats: string[];
};

export type ResolvedGridQuery = {
  query: GridQuery;
  droppedIndicators: string[];
};

export const INDICATOR_DIMENSION: Record<DatasetType, DisaggregationOption> = {
  hmis: "indicator_common_id",
  hfa: "hfa_indicator",
  iceh: "iceh_indicator",
};

export function unitDimension(unit: GridUnit): DisaggregationOption {
  return unit.kind === "admin" ? unit.level : "level";
}

export function timeDimension(
  family: DatasetType,
  grain: GridGrain,
): DisaggregationOption {
  switch (family) {
    case "hmis":
      return grain;
    case "hfa":
      return "time_point";
    case "iceh":
      return "year";
  }
}

// The family's primary module's metrics by id; empty when the package has
// no primary module for the family.
function primaryModuleMetrics(
  family: DatasetType,
  ctx: RunAuthoringContext,
): MetricWithStatus[] {
  const module = ctx.modules.find((m) =>
    m.family === family && m.tier === "primary"
  );
  return module === undefined ? [] : ctx.metrics
    .filter((m) => m.moduleId === module.id)
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

// Explore's metric for a family: the primary module's first ready metric by
// id.
export function primaryMetricFor(
  family: DatasetType,
  ctx: RunAuthoringContext,
): MetricWithStatus | undefined {
  return primaryModuleMetrics(family, ctx).find((m) => m.status === "ready");
}

export function familiesOffered(ctx: RunAuthoringContext): DatasetType[] {
  return MODULE_FAMILY_ORDER.filter((family) =>
    ctx.modules.some((m) => m.family === family && m.tier === "primary")
  );
}

function scopeLevel(scope: PackageScope): number {
  return scope.adminArea2 === null ? 1 : 2;
}

function levelNumber(level: AdminLevel): number {
  return ADMIN_LEVELS.indexOf(level) + 2;
}

export function levelOptionsFor(
  metric: MetricWithStatus | undefined,
  scope: PackageScope,
): AdminLevel[] {
  const offered = new Set(metric?.disaggregationOptions.map((d) => d.value));
  return ADMIN_LEVELS.filter((level) =>
    offered.has(level) && levelNumber(level) > scopeLevel(scope)
  );
}

function resolveLevel(
  wanted: AdminLevel,
  metric: MetricWithStatus | undefined,
  scope: PackageScope,
): AdminLevel {
  const valid = levelOptionsFor(metric, scope);
  if (valid.includes(wanted)) return wanted;
  if (valid.length > 0) return valid[0];
  const offered = ADMIN_LEVELS.filter((level) =>
    metric?.disaggregationOptions.some((d) => d.value === level)
  );
  return offered.at(-1) ?? wanted;
}

function familyDictionary(
  family: DatasetType,
  ctx: RunAuthoringContext,
): string[] {
  switch (family) {
    case "hmis":
      return ctx.hmisIndicators.map((i) => i.id);
    case "hfa":
      return ctx.hfaTaxonomy.indicators.map((i) => i.id);
    case "iceh":
      return ctx.icehIndicators.map((i) => i.id);
  }
}

function availableTimeValues(
  family: DatasetType,
  available: GridAvailable,
): string[] {
  switch (family) {
    case "hmis":
      return [];
    case "hfa":
      return available.hfaTimePoints;
    case "iceh":
      return available.icehYears;
  }
}

// Time is never a column group: HFA and ICEH values must never
// be pooled across rounds or years, so Indicators mode reads one of them.
function needsOnePeriod(family: DatasetType, columns: GridColumns): boolean {
  return family !== "hmis" && columns === "indicators";
}

function resolvePeriod(
  query: GridQuery,
  columns: GridColumns,
  available: GridAvailable,
): GridPeriod {
  if (query.family === "hmis") {
    return query.period.kind === "window"
      ? query.period
      : { kind: "values", values: [] };
  }
  const timeValues = availableTimeValues(query.family, available);
  const wanted = query.period.kind === "values" ? query.period.values : [];
  const chosen = timeValues.filter((v) => wanted.includes(v));
  if (!needsOnePeriod(query.family, columns)) {
    return { kind: "values", values: chosen };
  }
  const latest = chosen.at(-1) ?? timeValues.at(-1);
  return { kind: "values", values: latest === undefined ? [] : [latest] };
}

export function defaultGridQuery(
  family: DatasetType,
  scope: PackageScope,
  ctx: RunAuthoringContext,
  available: GridAvailable,
): GridQuery {
  const metric = primaryMetricFor(family, ctx);
  const unit: GridUnit = family === "iceh"
    ? { kind: "strat", strat: available.icehStrats[0] ?? "" }
    : {
      kind: "admin",
      level: resolveLevel(
        ADMIN_LEVELS[scopeLevel(scope) - 1] ?? "admin_area_2",
        metric,
        scope,
      ),
    };
  return {
    family,
    unit,
    indicators: [],
    period: { kind: "values", values: [] },
    grain: "period_id",
  };
}

// The query as the current package and scope can answer it. Intent is never
// discarded from state: the caller keeps its own query and reads through
// this on every change; dropped indicators are reported for the notice.
export function resolveGridQuery(
  query: GridQuery,
  columns: GridColumns,
  scope: PackageScope,
  ctx: RunAuthoringContext,
  available: GridAvailable,
): ResolvedGridQuery {
  const offered = familiesOffered(ctx);
  const family = offered.includes(query.family)
    ? query.family
    : offered[0] ?? query.family;
  const base: GridQuery = family === query.family
    ? query
    : defaultGridQuery(family, scope, ctx, available);
  const metric = primaryMetricFor(family, ctx);

  const unit: GridUnit = family === "iceh"
    ? {
      kind: "strat",
      strat: base.unit.kind === "strat" &&
          available.icehStrats.includes(base.unit.strat)
        ? base.unit.strat
        : available.icehStrats[0] ?? "",
    }
    : {
      kind: "admin",
      level: resolveLevel(
        base.unit.kind === "admin" ? base.unit.level : "admin_area_2",
        metric,
        scope,
      ),
    };

  const dictionary = new Set(familyDictionary(family, ctx));
  const indicators = base.indicators.filter((id) => dictionary.has(id));
  const droppedIndicators = base.indicators.filter((id) =>
    !dictionary.has(id)
  );

  return {
    query: {
      ...base,
      family,
      unit,
      indicators,
      period: resolvePeriod({ ...base, family }, columns, available),
    },
    droppedIndicators,
  };
}

type DisaggregateByEntry = PresentationObjectConfig["d"]["disaggregateBy"][
  number
];
type FilterByEntry = PresentationObjectConfig["d"]["filterBy"][number];

type DerivedConfig = {
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
};

// The family's primary metric and its first preset, the base every derived
// config replaces `d` on.
function primaryPreset(
  family: DatasetType,
  ctx: RunAuthoringContext,
): { metric: MetricWithStatus; preset: VizPreset } | undefined {
  const metric = primaryMetricFor(family, ctx);
  const preset = metric?.vizPresets?.[0];
  return metric === undefined || preset === undefined
    ? undefined
    : { metric, preset };
}

function indicatorFilter(query: GridQuery): FilterByEntry[] {
  return query.indicators.length > 0
    ? [{ disOpt: INDICATOR_DIMENSION[query.family], values: query.indicators }]
    : [];
}

// The figure config a resolved query reads as a table: the primary preset
// with `d` replaced. Undefined when the family has no ready metric or it
// declares no preset, or when a query that must read one period carries
// none (resolution supplies it).
export function deriveGridConfig(
  query: GridQuery,
  columns: GridColumns,
  ctx: RunAuthoringContext,
  language: Language,
): DerivedConfig | undefined {
  const found = primaryPreset(query.family, ctx);
  if (found === undefined) return undefined;
  const { metric, preset } = found;
  if (
    needsOnePeriod(query.family, columns) &&
    (query.period.kind !== "values" || query.period.values.length !== 1)
  ) {
    return undefined;
  }

  const indicatorDim = INDICATOR_DIMENSION[query.family];
  const timeDim = timeDimension(query.family, query.grain);
  const unitEntry: DisaggregateByEntry = query.unit.kind === "admin"
    ? {
      disOpt: query.unit.level,
      disDisplayOpt: "row",
      rollup: true,
      rollupPosition: "top",
    }
    : { disOpt: "level", disDisplayOpt: "row" };
  const disaggregateBy: DisaggregateByEntry[] = columns === "indicators"
    ? [unitEntry, { disOpt: indicatorDim, disDisplayOpt: "col" }]
    : [
      unitEntry,
      { disOpt: timeDim, disDisplayOpt: "col" },
      { disOpt: indicatorDim, disDisplayOpt: "colGroup" },
    ];

  const filterBy: FilterByEntry[] = [
    ...(query.unit.kind === "strat"
      ? [{ disOpt: "strat" as const, values: [query.unit.strat] }]
      : []),
    ...indicatorFilter(query),
    ...(query.family !== "hmis" && query.period.kind === "values" &&
        query.period.values.length > 0
      ? [{ disOpt: timeDim, values: query.period.values }]
      : []),
  ];

  const fromPreset = deriveConfigFromVizPreset(preset, language);
  return {
    metric,
    config: {
      ...fromPreset,
      d: {
        type: "table",
        valuesDisDisplayOpt: "col",
        disaggregateBy,
        filterBy,
        periodFilter: query.family === "hmis" && query.period.kind === "window"
          ? query.period.filter
          : undefined,
      },
    },
  };
}

// The figure config a resolved HMIS query reads as a timeseries: the primary
// preset with `d` replaced by lines over the query's grain, one pane per
// indicator, the chosen indicators as a filter and the window as the period
// filter. The preset's style is a table's, so the content is set here, and
// its text is cleared: the view's name is the caption. Undefined for HFA and ICEH,
// whose time points and years are not period columns, and when the family
// has no ready metric or no preset.
export function deriveTimeseriesConfig(
  query: GridQuery,
  ctx: RunAuthoringContext,
  language: Language,
): DerivedConfig | undefined {
  if (query.family !== "hmis") return undefined;
  const found = primaryPreset(query.family, ctx);
  if (found === undefined) return undefined;
  const fromPreset = deriveConfigFromVizPreset(found.preset, language);
  return {
    metric: found.metric,
    config: {
      ...fromPreset,
      s: { ...fromPreset.s, content: "lines" },
      t: { ...fromPreset.t, caption: "", subCaption: "", footnote: "" },
      d: {
        type: "timeseries",
        timeseriesGrouping: query.grain,
        valuesDisDisplayOpt: "series",
        disaggregateBy: [{
          disOpt: INDICATOR_DIMENSION[query.family],
          disDisplayOpt: "cell",
        }],
        filterBy: indicatorFilter(query),
        periodFilter: query.period.kind === "window"
          ? query.period.filter
          : undefined,
      },
    },
  };
}

export type GridPeriodChoice = {
  id: string;
  label: string;
  period: GridPeriod;
};

// HFA and ICEH offer "All" only where every value is readable at once:
// Time mode.
export function periodChoicesFor(
  family: DatasetType,
  columns: GridColumns,
  available: GridAvailable,
): GridPeriodChoice[] {
  const all: GridPeriodChoice = {
    id: "all",
    label: t3({ en: "All", fr: "Tout", pt: "Tudo" }),
    period: { kind: "values", values: [] },
  };
  if (family === "hmis") {
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
        period: { kind: "window", filter: { filterType: "last_calendar_year" } },
      },
      all,
    ];
  }
  const values = availableTimeValues(family, available).toReversed().map((
    value,
  ): GridPeriodChoice => ({
    id: value,
    label: value,
    period: { kind: "values", values: [value] },
  }));
  return needsOnePeriod(family, columns) ? values : [...values, all];
}

export function periodChoiceId(
  period: GridPeriod,
  choices: GridPeriodChoice[],
): string | undefined {
  const key = JSON.stringify(period);
  return choices.find((c) => JSON.stringify(c.period) === key)?.id;
}
