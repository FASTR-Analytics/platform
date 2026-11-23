// The configs the figure config tests run over: every preset of the local
// module definitions (FASTR_MODULES_LOCAL_DIR), and every distinct config the
// Explore page derives, each with its metric as a package with every facility
// column carries it.

import {
  ALL_DISAGGREGATION_OPTIONS,
  deriveConfigFromVizPreset,
  deriveViewConfig,
  EXPLORE_LEVELS,
  EXPLORE_VIEWS,
  type ExplorePeriod,
  type ExplorePossibleValues,
  type MetricWithStatus,
  type PresentationObjectConfig,
  resolveView,
  type RunAuthoringContext,
  vizPresetInstalled,
} from "lib";
import { canonical } from "./_figure_config_comparison.ts";
import {
  EVERY_FACILITY_COLUMN,
  metricsWithStatusOf,
  type ModuleDefinitions,
} from "./_module_definitions.ts";

export type FigureConfigItem = {
  id: string;
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
};

// The metrics of a package with every facility column, each carrying its
// presets as a package installs them.
export function metricsOf(definitions: ModuleDefinitions): MetricWithStatus[] {
  const presets = new Map(
    [...definitions.values()].flatMap((def) =>
      def.metrics.map((m) => [
        m.id,
        m.vizPresets.map((p) => vizPresetInstalled.parse(p)),
      ])
    ),
  );
  return metricsWithStatusOf(definitions, EVERY_FACILITY_COLUMN).map((m) => ({
    ...m,
    vizPresets: presets.get(m.id) ?? [],
  }));
}

export function presetItems(metrics: MetricWithStatus[]): FigureConfigItem[] {
  return metrics.flatMap((metric) =>
    (metric.vizPresets ?? []).map((preset) => ({
      id: `${metric.id}/${preset.id}`,
      metric,
      config: deriveConfigFromVizPreset(preset, "en"),
    }))
  );
}

const TWO_VALUES: ExplorePossibleValues = Object.fromEntries(
  ALL_DISAGGREGATION_OPTIONS.map((dim) => [dim, {
    status: "ok" as const,
    values: dim === "year"
      ? [{ id: "2018", label: "2018" }, { id: "2013", label: "2013" }]
      : [{ id: `${dim}_a`, label: "A" }, { id: `${dim}_b`, label: "B" }],
  }]),
);

const PERIODS: ExplorePeriod[] = [
  { kind: "values", values: [] },
  { kind: "values", values: ["2018"] },
  { kind: "window", filter: { filterType: "last_n_months", nMonths: 12 } },
  { kind: "window", filter: { filterType: "last_calendar_year" } },
];

// Every distinct config the Explore page derives, over every binding, type,
// level, switch option, scope area, period and grain.
export function exploreItems(
  definitions: ModuleDefinitions,
  metrics: MetricWithStatus[],
): FigureConfigItem[] {
  const ctx = {
    runId: "run",
    scopeToken: "token",
    modules: [...definitions.entries()].map(([id, def]) => ({
      id,
      label: def.label.en,
      family: def.family,
      tier: def.tier,
      sortOrder: def.sortOrder,
      hasParameters: false,
      lastRunAt: null,
      moduleDefinitionResultsObjectIds: def.resultsObjects.map((r) => r.id),
    })),
    metrics,
    datasets: [],
    hmisIndicators: [{ id: "x", label: "x" }],
    icehIndicators: [{ id: "x", label: "x", category: "x" }],
    hfaTaxonomy: { indicators: [{ id: "x", label: "x", categoryId: "x" }] },
    presets: [],
    population: null,
  } as unknown as RunAuthoringContext;
  const out = new Map<string, FigureConfigItem>();
  for (const [moduleId, bindings] of Object.entries(EXPLORE_VIEWS)) {
    const family = definitions.get(moduleId)?.family;
    if (family === undefined) continue;
    for (const binding of bindings) {
      const switches = "switch" in binding.metric
        ? binding.metric.switch.options.map((o) => o.id)
        : [undefined];
      for (const type of binding.types) {
        for (const level of [undefined, ...EXPLORE_LEVELS]) {
          for (const sw of switches) {
            for (const scopeArea of [null, "Kano"]) {
              for (const period of PERIODS) {
                for (
                  const grain of ["period_id", "quarter_id", "year"] as const
                ) {
                  const view = resolveView({
                    binding,
                    family,
                    type: type.type,
                    query: { level, indicators: [], period, grain },
                    choices: sw === undefined
                      ? undefined
                      : { switch: sw, pinned: {} },
                    scopeArea,
                    ctx,
                    possibleValues: TWO_VALUES,
                  });
                  if (view === undefined) continue;
                  const derived = deriveViewConfig(view, "en");
                  if (derived === undefined) continue;
                  const key = derived.metric.id + canonical(derived.config);
                  if (out.has(key)) continue;
                  out.set(key, {
                    id: `${moduleId}/${binding.id}/${type.type}/${
                      level ?? "-"
                    }/${sw ?? "-"}/${scopeArea ?? "national"}/${grain}`,
                    metric: derived.metric,
                    config: derived.config,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
  return [...out.values()];
}
