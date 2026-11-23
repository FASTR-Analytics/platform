// The figure config against the module definitions of the local checkout
// (FASTR_MODULES_LOCAL_DIR): every preset and every config the Explore page
// derives converts, fits the schema and passes the metric checks; what the
// converted config derives equals what today's functions derive from the
// stored one, but for the cases the conversion means to change; the wizard's
// starting config passes for every metric and type; and two configs of one
// metric that read two queries hold two settings keys.
//
//   FASTR_MODULES_LOCAL_DIR=<modules repo> deno test -A --env-file server/tests/figure_config_presets_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  ALL_DISAGGREGATION_OPTIONS,
  deriveConfigFromVizPreset,
  deriveViewConfig,
  EXPLORE_LEVELS,
  EXPLORE_VIEWS,
  type ExplorePeriod,
  type ExplorePossibleValues,
  type FigureConfig,
  figureFetchConfig,
  get_PRESENTATION_SELECT_OPTIONS,
  type MetricWithStatus,
  type PresentationObjectConfig,
  resolveView,
  type RunAuthoringContext,
  settingsKey,
  startingFigureConfig,
  validateFigureConfig,
  vizPresetInstalled,
} from "lib";
import { canonical, compareWithToday } from "./_figure_config_comparison.ts";
import {
  EVERY_FACILITY_COLUMN,
  loadModuleDefinitions,
  metricsWithStatusOf,
  type ModuleDefinitions,
} from "./_module_definitions.ts";

const MODULES_DIR = Deno.env.get("FASTR_MODULES_LOCAL_DIR");

type Item = {
  id: string;
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
};

// The metrics of a package with every facility column, each carrying its
// presets as a package installs them.
function metricsOf(definitions: ModuleDefinitions): MetricWithStatus[] {
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

// Two configs read one query exactly when their fetch configs hold the same
// values, groups, filters, period filter and roll-up, each list as a set.
function fetchIdentity(config: FigureConfig, metric: MetricWithStatus): string {
  const fetch = figureFetchConfig(config, metric);
  return fetch.success
    ? canonical({
      ...fetch.data,
      values: fetch.data.values.map((v) => `${v.func}&${v.prop}`).sort(),
      groupBys: [...fetch.data.groupBys].sort(),
      filters: fetch.data.filters
        .map((f) => [f.disOpt, f.values.map(String).sort()])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    })
    : fetch.err;
}

function presetItems(metrics: MetricWithStatus[]): Item[] {
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
function exploreItems(
  definitions: ModuleDefinitions,
  metrics: MetricWithStatus[],
): Item[] {
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
  const out = new Map<string, Item>();
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

Deno.test({
  name: "figure config: presets, Explore configs, starting configs",
  ignore: MODULES_DIR === undefined,
  async fn(t) {
    const definitions = await loadModuleDefinitions(MODULES_DIR ?? "");
    const metrics = metricsOf(definitions);
    const items = [
      ...presetItems(metrics),
      ...exploreItems(definitions, metrics),
    ];
    const converted = new Map<Item, FigureConfig>();

    await t.step(
      "every preset and Explore config converts, fits and passes",
      () => {
        assertEquals(presetItems(metrics).length, 50);
        assert(items.length > 200, `${items.length} configs`);
        const failures: string[] = [];
        for (const item of items) {
          const c = compareWithToday({
            metric: item.metric,
            config: item.config,
            singleValueDims: new Set(),
          });
          if (c.kind !== "converted") {
            failures.push(`${item.id}: ${c.kind} ${canonical(c)}`);
            continue;
          }
          converted.set(item, c.config);
          if (c.problems.length > 0) {
            failures.push(`${item.id}: ${canonical(c.problems)}`);
          }
          for (const d of c.differences) {
            if (
              d.listed !== "filteredDimGrouped" &&
              d.listed !== "valuePropsOnTwoAxesToday"
            ) {
              failures.push(
                `${item.id}: ${d.aspect} today ${d.today}, converted ${d.next}`,
              );
            }
          }
        }
        assertEquals(failures, []);
      },
    );

    await t.step("the starting config of every metric and type passes", () => {
      const failures: string[] = [];
      for (const metric of metrics) {
        const optional = metric.disaggregationOptions
          .filter((o) => !o.isRequired)
          .map((o) => o.value);
        for (
          const { value: type } of get_PRESENTATION_SELECT_OPTIONS(
            metric.disaggregationOptions,
          )
        ) {
          for (const chosen of [[], ...optional.map((dim) => [dim])]) {
            const config = startingFigureConfig(metric, type, chosen);
            const problems = validateFigureConfig(config, metric);
            if (problems.length > 0) {
              failures.push(
                `${metric.id} ${type} [${chosen}]: ${canonical(problems)}`,
              );
            }
          }
        }
      }
      assertEquals(failures, []);
    });

    await t.step(
      "two configs that read two queries hold two settings keys",
      () => {
        const byMetric = new Map<
          string,
          { item: Item; config: FigureConfig }[]
        >();
        for (const [item, config] of converted) {
          const list = byMetric.get(item.metric.id) ?? [];
          list.push({ item, config });
          byMetric.set(item.metric.id, list);
        }
        let pairs = 0;
        const failures: string[] = [];
        for (const [metricId, list] of byMetric) {
          const keyed = list.map(({ item, config }) => ({
            id: item.id,
            fetch: fetchIdentity(config, item.metric),
            key: settingsKey(metricId, config),
          }));
          for (let i = 0; i < keyed.length; i++) {
            for (let j = i + 1; j < keyed.length; j++) {
              if (keyed[i].fetch === keyed[j].fetch) continue;
              pairs++;
              if (keyed[i].key === keyed[j].key) {
                failures.push(`${keyed[i].id} and ${keyed[j].id}`);
              }
            }
          }
        }
        assert(pairs > 0);
        assertEquals(failures, []);
      },
    );
  },
});
