import { ADMIN_LEVELS, type AdminLevel } from "./rollup.ts";
import type { TranslatableString } from "./translate/mod.ts";
import type { DisaggregationOption } from "./types/disaggregation_options.ts";
import type {
  InstalledModuleSummary,
  MetricWithStatus,
} from "./types/modules.ts";
import type { RunAuthoringContext } from "./types/run_authoring_context.ts";

// The Explore page's bindings (SYSTEM_11 "Explore query model"): which views
// a module offers, which metric each reads, the roles it names and how each
// view type lays them out. Presentation is deployable and a manifest is
// frozen, so the bindings live here and not in the module definitions.

export type ExploreAxis = "area" | "unit" | "category" | "time" | "values";

export type ExploreViewType =
  | { type: "table"; rows: ExploreAxis; cols: ExploreAxis; values?: string[] }
  | { type: "timeseries"; series?: "unit"; values?: string[] }
  | {
    type: "chart";
    axis: "area" | "category";
    series?: "unit";
    values?: string[];
  }
  | { type: "map"; values?: string[] };

export type ExploreViewTypeId = ExploreViewType["type"];

export type ExploreLevel = "national" | AdminLevel;

// Shallowest first.
export const EXPLORE_LEVELS: readonly ExploreLevel[] = [
  "national",
  ...ADMIN_LEVELS,
];

export type ExploreSwitchOption = {
  id: string;
  label: TranslatableString;
  metricId: string;
};

export type ExploreMetricBinding =
  | { id: string }
  | { byLevel: Partial<Record<ExploreLevel, string>> }
  | { switch: { label: TranslatableString; options: ExploreSwitchOption[] } };

export type ExploreViewBinding = {
  id: string;
  label: TranslatableString;
  metric: ExploreMetricBinding;
  unit?: DisaggregationOption;
  category?: DisaggregationOption;
  facets?: DisaggregationOption[];
  types: ExploreViewType[];
};

export const EXPLORE_TYPE_LABELS: Record<
  ExploreViewTypeId,
  TranslatableString
> = {
  table: { en: "Table", fr: "Tableau", pt: "Tabela" },
  timeseries: {
    en: "Over time",
    fr: "Dans le temps",
    pt: "Ao longo do tempo",
  },
  chart: { en: "Chart", fr: "Graphique", pt: "Gráfico" },
  map: { en: "Map", fr: "Carte", pt: "Mapa" },
};

// Module id → its views in display order. The first type of a view is its
// default.
export const EXPLORE_VIEWS: Record<string, ExploreViewBinding[]> = {
  m012: [
    {
      id: "service_counts",
      label: {
        en: "Service counts",
        fr: "Volumes de services",
        pt: "Volumes de serviços",
      },
      metric: { id: "m12-01-01" },
      category: "indicator_common_id",
      types: [
        { type: "table", rows: "area", cols: "category" },
        { type: "timeseries" },
      ],
    },
  ],
};

// Every non-hidden metric of a registry module that no binding reads, with
// the reason.
export const UNBOUND_METRICS: { metricId: string; reason: string }[] = [];

export function boundMetricIds(metric: ExploreMetricBinding): string[] {
  if ("id" in metric) return [metric.id];
  if ("byLevel" in metric) {
    const byLevel = metric.byLevel;
    return EXPLORE_LEVELS.flatMap((level) => {
      const id = byLevel[level];
      return id === undefined ? [] : [id];
    });
  }
  return metric.switch.options.map((o) => o.metricId);
}

// A metric the package carries, stamped ready.
export function readyMetric(
  ctx: RunAuthoringContext,
  id: string,
): MetricWithStatus | undefined {
  const metric = ctx.metrics.find((m) => m.id === id);
  return metric?.status === "ready" ? metric : undefined;
}

// R7: a view is offered only for metrics the package carries: `{ id }`
// ready; `byLevel` and `switch` with at least one ready option.
export function viewsForModule(
  module: InstalledModuleSummary,
  ctx: RunAuthoringContext,
): ExploreViewBinding[] {
  return (EXPLORE_VIEWS[module.id] ?? []).filter((binding) =>
    boundMetricIds(binding.metric).some((id) =>
      readyMetric(ctx, id) !== undefined
    )
  );
}

// The key of every per-view state.
export function exploreViewKey(moduleId: string, viewId: string): string {
  return `${moduleId}/${viewId}`;
}
