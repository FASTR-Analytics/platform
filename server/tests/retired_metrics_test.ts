// The lockstep guard for the retired-metric successors (lib/retired_metrics.ts).
// The retired side is m003 as it last shipped, from the fixture; the pure
// checks always run, and the checks against the successor definitions need
// the local modules checkout (FASTR_MODULES_LOCAL_DIR) and are skipped
// otherwise:
//
//   deno test -A --env-file server/tests/retired_metrics_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  deriveConfigFromVizPreset,
  figurePackageIssueForMetrics,
  getFetchConfigFromPresentationObjectConfig,
  type Language,
  type MetricDefinitionGithub,
  type MetricWithStatus,
  moduleDefinitionGithubSchema,
  type PresentationObjectConfig,
  presentationObjectConfigSchema,
  resolveFigureMetric,
  resolveTS,
  RETIRED_METRICS,
  retiredMetric,
  type StoredFigure,
  succeedRetiredFigure,
  vizPresetInstalled,
} from "lib";
import {
  loadModuleDefinitions,
  metricsWithStatusOf,
  type ModuleDefinitions,
} from "./_module_definitions.ts";

const MODULES_DIR = Deno.env.get("FASTR_MODULES_LOCAL_DIR");
const LANGUAGES: Language[] = ["en", "fr", "pt"];

// m003 as the modules repo last built it, before its deletion, with the
// presentation facts the manifest transform stamps on a blob written before
// the definition declared them.
const M003 = moduleDefinitionGithubSchema.parse({
  ...JSON.parse(
    await Deno.readTextFile(
      new URL("./fixtures/m003_definition.json", import.meta.url),
    ),
  ),
  family: "hmis",
  tier: "secondary",
  sortOrder: 6,
});

type Preset = MetricDefinitionGithub["vizPresets"][number];

function presetOf(
  metric: MetricDefinitionGithub,
  presetId: string,
): Preset {
  const preset = metric.vizPresets.find((p) => p.id === presetId);
  assert(preset !== undefined, `${metric.id} has no preset ${presetId}`);
  return preset;
}

function m003Metric(metricId: string): MetricDefinitionGithub {
  const metric = M003.metrics.find((m) => m.id === metricId);
  assert(metric !== undefined, `m003 has no metric ${metricId}`);
  return metric;
}

// The config a preset inserted as a figure, resolved in a language.
function presetConfig(preset: Preset, language: Language) {
  return deriveConfigFromVizPreset(vizPresetInstalled.parse(preset), language);
}

function stored(
  metricId: string,
  config: PresentationObjectConfig,
  language: Language = "en",
): StoredFigure {
  return { metricId, config, localization: { language } };
}

function succeed(figure: StoredFigure) {
  const retired = retiredMetric(figure.metricId);
  assert(retired !== undefined, `${figure.metricId} is not retired`);
  const succession = succeedRetiredFigure(
    retired,
    figure.config,
    figure.localization.language,
  );
  assert(succession !== undefined, `${figure.metricId} has no successor`);
  return succession;
}

// Every m003 preset and the successor preset a user inserting it today would
// pick. `sameLayout` says the two lay their dimensions out alike, so the
// carried data config is the successor preset's; the three grid charts keep
// the retired layout (indicators across, areas down) by design.
type Pair = {
  from: [metricId: string, presetId: string];
  to: [metricId: string, presetId: string];
  sameLayout: boolean;
};

const PAIRS: Pair[] = [
  {
    from: ["m3-01-01", "volume-monthly"],
    to: ["m12-01-01", "values-monthly"],
    sameLayout: true,
  },
  {
    from: ["m3-01-01", "volume-quarterly"],
    to: ["m12-01-01", "values-quarterly-change"],
    sameLayout: true,
  },
  {
    from: ["m3-01-01", "volume-annual"],
    to: ["m12-01-01", "values-annual-change"],
    sameLayout: true,
  },
  {
    from: ["m3-01-01", "volume-subnational"],
    to: ["m12-01-01", "values-annual-change-admin-area-2"],
    sameLayout: true,
  },
  {
    from: ["m3-01-01", "dq-comparison"],
    to: ["m2-02-01", "adjustment-comparison"],
    sameLayout: true,
  },
  {
    from: ["m3-02-01", "disruption-chart"],
    to: ["m11-01-01", "observed-expected-ci"],
    sameLayout: true,
  },
  {
    from: ["m3-03-01", "disruption-chart"],
    to: ["m11-01-02", "observed-expected-ci"],
    sameLayout: false,
  },
  {
    from: ["m3-03-01", "disruption-chart-single-admin-area-2"],
    to: ["m11-01-02", "observed-expected-ci-single-admin-area-2"],
    sameLayout: true,
  },
  {
    from: ["m3-03-01", "disruption-chart-single-indicator"],
    to: ["m11-01-02", "observed-expected-ci-single-indicator"],
    sameLayout: true,
  },
  {
    from: [
      "m3-04-01",
      "disruption-chart-single-admin-area-2-multiple-admin-area-3",
    ],
    to: [
      "m11-01-03",
      "observed-expected-ci-single-admin-area-2-multiple-admin-area-3",
    ],
    sameLayout: false,
  },
  {
    from: ["m3-04-01", "disruption-chart-single-admin-area-3"],
    to: ["m11-01-03", "observed-expected-ci-single-admin-area-3"],
    sameLayout: true,
  },
  {
    from: [
      "m3-05-01",
      "disruption-chart-single-admin-area-3-multiple-admin-area-4",
    ],
    to: [
      "m11-01-04",
      "observed-expected-ci-single-admin-area-3-multiple-admin-area-4",
    ],
    sameLayout: false,
  },
  {
    from: ["m3-05-01", "disruption-chart-single-admin-area-4"],
    to: ["m11-01-04", "observed-expected-ci-single-admin-area-4"],
    sameLayout: true,
  },
  {
    from: ["m3-03-02", "disruption-differences-table"],
    to: ["m11-02-01", "disruption-table-admin-area-2"],
    sameLayout: true,
  },
  {
    from: ["m3-03-02", "disruption-differences-map-admin-area-2"],
    to: ["m11-02-01", "disruption-map-admin-area-2"],
    sameLayout: true,
  },
  {
    from: [
      "m3-04-02",
      "disruption-differences-table-single-admin-area-2-multiple-admin-area-3",
    ],
    to: ["m11-02-01", "disruption-table-admin-area-3"],
    sameLayout: true,
  },
  {
    from: ["m3-04-02", "disruption-differences-map-admin-area-3"],
    to: ["m11-02-01", "disruption-map-admin-area-3"],
    sameLayout: true,
  },
  {
    from: [
      "m3-05-02",
      "disruption-differences-table-single-admin-area-3-multiple-admin-area-4",
    ],
    to: ["m11-02-01", "disruption-table-admin-area-4"],
    sameLayout: true,
  },
];

const BAND_CHART_METRICS = ["m3-02-01", "m3-03-01", "m3-04-01", "m3-05-01"];

// The renderer substitutes the date range for any of the three spellings of
// its token (build_figure_inputs.ts, withDateRange), so a text kept with the
// Portuguese token reads as a successor text that has only the English one.
function oneDateRangeToken(text: string): string {
  return text.replaceAll("PLAGE_DE_DATES", "DATE_RANGE").replaceAll(
    "INTERVALO_DE_DATAS",
    "DATE_RANGE",
  );
}

// Pure checks

Deno.test("retired: every m003 metric has an entry named as its definition named it, and nothing else does", () => {
  for (const m of M003.metrics) {
    const retired = retiredMetric(m.id);
    assert(retired !== undefined, `${m.id} has no entry`);
    assertEquals(retired.moduleId, "m003");
    for (const language of LANGUAGES) {
      const variant = m.variantLabel === null
        ? ""
        : ` (${resolveTS(m.variantLabel, language)})`;
      assertEquals(
        resolveTS(retired.label, language),
        `${resolveTS(m.label, language)}${variant}`,
        `${m.id} label in ${language}`,
      );
      assertEquals(
        resolveTS(retired.moduleLabel, language),
        resolveTS(M003.label, language),
      );
    }
  }
  const ids = new Set(M003.metrics.map((m) => m.id));
  for (const retired of RETIRED_METRICS) {
    assert(ids.has(retired.id), `${retired.id} is not an m003 metric`);
  }
});

Deno.test("retired: every preset of every retired metric carries to a config the schema accepts", () => {
  for (const m of M003.metrics) {
    for (const preset of m.vizPresets) {
      for (const language of LANGUAGES) {
        const succession = succeed(
          stored(m.id, presetConfig(preset, language), language),
        );
        presentationObjectConfigSchema.parse(succession.config);
        const pair = PAIRS.find((p) =>
          p.from[0] === m.id && p.from[1] === preset.id
        );
        assert(pair !== undefined, `${m.id}/${preset.id} has no pair`);
        assertEquals(succession.metricId, pair.to[0], `${m.id}/${preset.id}`);
      }
    }
  }
  assertEquals(
    PAIRS.length,
    M003.metrics.reduce((n, m) => n + m.vizPresets.length, 0),
  );
});

Deno.test("retired: the figure's own metric wins when the package still carries it", () => {
  const m = m003Metric("m3-02-01");
  const config = presetConfig(presetOf(m, "disruption-chart"), "en");
  const own = { id: "m3-02-01" } as MetricWithStatus;
  const successor = { id: "m11-01-01" } as MetricWithStatus;
  const resolution = resolveFigureMetric(
    [successor, own],
    stored("m3-02-01", config),
  );
  assertEquals(resolution.kind, "current");
  assert(resolution.kind === "current" && resolution.metric === own);
  assert(resolution.config === config);
});

Deno.test("retired: a package with the successor resolves to it with the carried config", () => {
  const m = m003Metric("m3-02-01");
  const config = presetConfig(presetOf(m, "disruption-chart"), "en");
  const successor = { id: "m11-01-01" } as MetricWithStatus;
  const resolution = resolveFigureMetric(
    [successor],
    stored("m3-02-01", config),
  );
  assert(resolution.kind === "succeeded");
  assert(resolution.metric === successor);
  assertEquals(resolution.retired.id, "m3-02-01");
  assertEquals(resolution.config.s.specialDisruptionsChartV2, true);
});

Deno.test("retired: a package with neither names the successor; an unknown metric names nothing", () => {
  const m = m003Metric("m3-03-02");
  const config = presetConfig(
    presetOf(m, "disruption-differences-table"),
    "en",
  );
  const absent = resolveFigureMetric([], stored("m3-03-02", config));
  assert(absent.kind === "absent");
  assertEquals(absent.retired?.metric.id, "m3-03-02");
  assertEquals(absent.retired?.successor, {
    metricId: "m11-02-01",
    moduleId: "m011",
  });
  const unknown = resolveFigureMetric([], stored("m9-99-99", config));
  assert(unknown.kind === "absent");
  assertEquals(unknown.retired, undefined);
});

Deno.test("retired: the disruptions chart becomes the band chart with no value filter", () => {
  for (const metricId of BAND_CHART_METRICS) {
    for (const preset of m003Metric(metricId).vizPresets) {
      const config = presetConfig(preset, "en");
      assertEquals(config.s.specialDisruptionsChart, true);
      const { config: carried } = succeed(
        stored(metricId, {
          ...config,
          d: { ...config.d, valuesFilter: ["count_sum"] },
        }),
      );
      assertEquals(carried.s.specialDisruptionsChart, false);
      assertEquals(carried.s.specialDisruptionsChartV2, true);
      assertEquals(carried.s.content, "lines");
      assertEquals(carried.d.valuesFilter, undefined);
      assert(!("valuesFilter" in carried.d));
    }
  }
});

Deno.test("retired: a disruptions chart with its mode off keeps the mode off and renames its value filter", () => {
  const m = m003Metric("m3-03-01");
  const config = presetConfig(presetOf(m, "disruption-chart"), "en");
  const { config: carried } = succeed(
    stored("m3-03-01", {
      ...config,
      d: {
        ...config.d,
        valuesFilter: ["count_expected_if_above_diff_threshold", "count_sum"],
      },
      s: { ...config.s, specialDisruptionsChart: false },
    }),
  );
  assertEquals(carried.s.specialDisruptionsChart, false);
  assertEquals(carried.s.specialDisruptionsChartV2, false);
  assertEquals(carried.s.content, config.s.content);
  assertEquals(carried.d.valuesFilter, ["expected", "observed"]);
});

Deno.test("retired: m3-01-01 goes to the indicator value for one basis and to the adjusted data for several or none", () => {
  const m = m003Metric("m3-01-01");
  const monthly = presetConfig(presetOf(m, "volume-monthly"), "en");
  assertEquals(monthly.d.valuesFilter, ["count_final_both"]);
  const one = succeed(stored("m3-01-01", monthly));
  assertEquals(one.metricId, "m12-01-01");
  assert(!("valuesFilter" in one.config.d));

  const two = succeed(
    stored("m3-01-01", {
      ...monthly,
      d: {
        ...monthly.d,
        valuesFilter: ["count_final_none", "count_final_both"],
      },
    }),
  );
  assertEquals(two.metricId, "m2-02-01");
  assertEquals(two.config.d.valuesFilter, [
    "count_final_none",
    "count_final_both",
  ]);

  const comparison = presetConfig(presetOf(m, "dq-comparison"), "en");
  const none = succeed(stored("m3-01-01", comparison));
  assertEquals(none.metricId, "m2-02-01");
  assertEquals(none.config, comparison);
});

Deno.test("retired: the observed and expected pair renames its value filter and drops a prop the successor lacks", () => {
  const config = presetConfig(
    presetOf(m003Metric("m3-02-01"), "disruption-chart"),
    "en",
  );
  const pair = succeed(
    stored("m3-03-03", {
      ...config,
      d: { ...config.d, valuesFilter: ["count_sum", "count_expect_sum"] },
      s: { ...config.s, specialDisruptionsChart: false },
    }),
  );
  assertEquals(pair.metricId, "m11-02-02");
  assertEquals(pair.config.d.valuesFilter, ["observed", "expected"]);
  const dropped = succeed(
    stored("m3-04-03", {
      ...config,
      d: { ...config.d, valuesFilter: ["bogus"] },
    }),
  );
  assert(!("valuesFilter" in dropped.config.d));
});

Deno.test("retired: a user's own text is kept, a preset's text is replaced in the figure's language", () => {
  const preset = presetOf(m003Metric("m3-02-01"), "disruption-chart");
  const fr = presetConfig(preset, "fr");
  const carried = succeed(stored("m3-02-01", fr, "fr")).config;
  assertEquals(
    carried.t.caption,
    "Services observés vs attendus avec intervalle de crédibilité à 95%",
  );
  assertEquals(carried.t.footnote, "");
  assertEquals(carried.t.subCaption, fr.t.subCaption);

  const own = succeed(
    stored("m3-02-01", {
      ...fr,
      t: { ...fr.t, caption: "Ma légende", footnote: "Ma note" },
    }, "fr"),
  ).config;
  assertEquals(own.t.caption, "Ma légende");
  assertEquals(own.t.footnote, "Ma note");

  // A text stored in one language is recognised whatever language the
  // figure now carries, and replaced in that language.
  const en = presetConfig(preset, "en");
  const relabelled = succeed(stored("m3-02-01", en, "fr")).config;
  assertEquals(
    relabelled.t.caption,
    "Services observés vs attendus avec intervalle de crédibilité à 95%",
  );

  // A translation the successor lacks is kept rather than replaced by the
  // English fallback; a text the successor drops is cleared whatever the
  // language.
  const pt = presetConfig(preset, "pt");
  const kept = succeed(stored("m3-02-01", pt, "pt")).config;
  assertEquals(kept.t.caption, pt.t.caption);
  assertEquals(kept.t.footnote, "");
});

// Checks against the successor definitions

Deno.test({
  name: "retired: against the module definitions",
  ignore: MODULES_DIR === undefined,
  async fn(t) {
    const definitions: ModuleDefinitions = await loadModuleDefinitions(
      MODULES_DIR ?? "",
    );
    const metrics = metricsWithStatusOf(definitions);
    const successorPreset = (pair: Pair): Preset => {
      const [moduleId] = [...definitions.entries()].find(([, def]) =>
        def.metrics.some((m) =>
          m.id === pair.to[0]
        )
      ) ?? [];
      assert(moduleId !== undefined, `no module carries ${pair.to[0]}`);
      const metric = definitions.get(moduleId)?.metrics.find((m) =>
        m.id === pair.to[0]
      );
      assert(metric !== undefined);
      return presetOf(metric, pair.to[1]);
    };

    await t.step(
      "every carried preset resolves to a ready successor the package can serve",
      () => {
        for (const pair of PAIRS) {
          const preset = presetOf(m003Metric(pair.from[0]), pair.from[1]);
          for (const language of LANGUAGES) {
            const where = `${pair.from.join("/")} in ${language}`;
            const resolution = resolveFigureMetric(
              metrics,
              stored(pair.from[0], presetConfig(preset, language), language),
            );
            assert(resolution.kind === "succeeded", `${where} did not succeed`);
            assertEquals(resolution.metric.id, pair.to[0], where);
            const { metric, config } = resolution;
            assertEquals(
              figurePackageIssueForMetrics(metric.id, config, metrics, null),
              null,
              `${where} has a package issue`,
            );
            const fetch = getFetchConfigFromPresentationObjectConfig(
              metric,
              config,
            );
            assert(
              fetch.success,
              `${where}: ${fetch.success ? "" : fetch.err}`,
            );
            const grouped = new Set<string>([
              ...config.d.disaggregateBy.map((e) => e.disOpt),
              ...(config.d.timeseriesGrouping === undefined
                ? []
                : [config.d.timeseriesGrouping]),
            ]);
            for (
              const dim of metric.disaggregationOptions.filter((o) =>
                o.isRequired
              )
            ) {
              assert(
                grouped.has(dim.value),
                `${where} lacks the required ${dim.value}`,
              );
            }
            for (const prop of config.d.valuesFilter ?? []) {
              assert(
                metric.valueProps.includes(prop),
                `${where} filters on ${prop}, which ${metric.id} lacks`,
              );
            }
            if (config.s.specialDisruptionsChartV2) {
              assertEquals(
                metric.valueProps,
                ["observed", "expected", "ppi_lwr", "ppi_upr"],
                `${where}: the band chart's series order`,
              );
              assert(!("valuesFilter" in config.d), where);
            }
          }
        }
      },
    );

    await t.step(
      "a carried preset reads as the successor's own preset: its style, its texts where the retired preset had any, and its layout where the two agree",
      () => {
        for (const pair of PAIRS) {
          const retiredPreset = presetOf(
            m003Metric(pair.from[0]),
            pair.from[1],
          );
          const successor = successorPreset(pair);
          for (const language of LANGUAGES) {
            const where = `${pair.from.join("/")} in ${language}`;
            const carried = succeed(
              stored(
                pair.from[0],
                presetConfig(retiredPreset, language),
                language,
              ),
            ).config;
            const expected = presetConfig(successor, language);
            assertEquals(carried.s, expected.s, `${where}: style`);
            for (
              const field of ["caption", "subCaption", "footnote"] as const
            ) {
              // A preset text the successor has in the figure's language
              // becomes the successor's; one it has in no translation of
              // that language stays as it was, since an English fallback is
              // not a better caption than a Portuguese one.
              const retiredText = retiredPreset.config.t[field];
              const successorText = successor.config.t[field];
              const expectedText =
                retiredText === null || successorText === null
                  ? ""
                  : successorText[language] ?? resolveTS(retiredText, language);
              assertEquals(
                oneDateRangeToken(carried.t[field]),
                oneDateRangeToken(expectedText),
                `${where}: ${field}`,
              );
            }
            if (pair.sameLayout) {
              // The selected replicant is the figure's own choice of area or
              // indicator; the successor preset's default is not a better one.
              const { selectedReplicantValue: _a, ...carriedD } = carried.d;
              const { selectedReplicantValue: _b, ...expectedD } = expected.d;
              assertEquals(carriedD, expectedD, `${where}: data config`);
            }
          }
        }
      },
    );
  },
});
