// Harness for the Explore query model: level, pin, time, style and values
// resolution, and the derived config of one binding per type.
//
//   deno test -A server/tests/explore_query_test.ts

import { assertEquals } from "@std/assert";
import {
  type DatasetType,
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  deriveViewConfig,
  type DisaggregationOption,
  EXPLORE_VIEWS,
  type ExplorePossibleValues,
  type ExploreViewBinding,
  type MetricWithStatus,
  periodChoiceId,
  resolveView,
  type ResolveViewInput,
  type RunAuthoringContext,
  viewsForModule,
  type VizPreset,
} from "lib";

const NATIONAL: string | null = null;
const KANO: string | null = "Kano";

function preset(
  type: VizPreset["config"]["d"]["type"],
  s: Record<string, unknown>,
): VizPreset {
  return {
    id: `${type}-preset`,
    label: { en: type, fr: type },
    description: { en: "", fr: "" },
    importantNotes: null,
    allowedFilters: [],
    createDefaultVisualizationOnInstall: null,
    config: {
      d: {
        type,
        valuesDisDisplayOpt: "col",
        disaggregateBy: [],
        filterBy: [],
      },
      s,
      t: {
        caption: { en: "Preset caption", fr: "" },
        captionRelFontSize: null,
        subCaption: null,
        subCaptionRelFontSize: null,
        footnote: null,
        footnoteRelFontSize: null,
      },
    },
  } as unknown as VizPreset;
}

const HMIS_TIME: DisaggregationOption[] = ["period_id", "quarter_id", "year"];

function metric(args: {
  id: string;
  moduleId: string;
  dims: DisaggregationOption[];
  required?: DisaggregationOption[];
  valueProps?: string[];
  formatAs?: MetricWithStatus["formatAs"];
  periodColumn?: MetricWithStatus["mostGranularTimePeriodColumnInResultsFile"];
  presets?: VizPreset[];
  status?: MetricWithStatus["status"];
}): MetricWithStatus {
  return {
    id: args.id,
    moduleId: args.moduleId,
    status: args.status ?? "ready",
    label: args.id,
    formatAs: args.formatAs ?? "percent",
    valueProps: args.valueProps ?? ["value"],
    valueFunc: "AVG",
    resultsObjectId: `${args.id}.csv`,
    mostGranularTimePeriodColumnInResultsFile: args.periodColumn,
    disaggregationOptions: args.dims.map((value) => ({
      value,
      isRequired: (args.required ?? []).includes(value),
    })),
    vizPresets: args.presets ?? [],
  };
}

function module(id: string, family: DatasetType) {
  return {
    id,
    label: id,
    family,
    tier: "primary" as const,
    sortOrder: 0,
    hasParameters: false,
    lastRunAt: null,
    moduleDefinitionResultsObjectIds: [],
  };
}

const METRICS: MetricWithStatus[] = [
  metric({
    id: "m12-01-01",
    moduleId: "m012",
    dims: [
      "indicator_common_id",
      "admin_area_2",
      "admin_area_3",
      "admin_area_4",
      ...HMIS_TIME,
    ],
    required: ["indicator_common_id"],
    formatAs: "indicator",
    periodColumn: "period_id",
    presets: [preset("table", { cfMode: "indicator" })],
  }),
  metric({
    id: "m1-03-01",
    moduleId: "m001",
    dims: ["ratio_type", "admin_area_2", "admin_area_3", ...HMIS_TIME],
    required: ["ratio_type"],
    periodColumn: "period_id",
  }),
  metric({
    id: "m1-04-01",
    moduleId: "m001",
    dims: ["admin_area_2", "admin_area_3", ...HMIS_TIME],
    periodColumn: "period_id",
    presets: [preset("table", { cfMode: "thresholds" })],
  }),
  metric({
    id: "m2-01-01",
    moduleId: "m002",
    dims: ["indicator_common_id", "admin_area_2", ...HMIS_TIME],
    periodColumn: "period_id",
  }),
  metric({
    id: "m2-01-02",
    moduleId: "m002",
    dims: ["indicator_common_id", "admin_area_2", ...HMIS_TIME],
    periodColumn: "period_id",
  }),
  metric({
    id: "m11-01-01",
    moduleId: "m011",
    dims: ["indicator_common_id", ...HMIS_TIME],
    required: ["indicator_common_id"],
    valueProps: ["observed", "expected", "ppi_lwr", "ppi_upr"],
    formatAs: "number",
    periodColumn: "period_id",
    presets: [preset("timeseries", { specialDisruptionsChartV2: true })],
  }),
  metric({
    id: "m11-01-02",
    moduleId: "m011",
    dims: ["indicator_common_id", "admin_area_2", ...HMIS_TIME],
    required: ["indicator_common_id", "admin_area_2"],
    valueProps: ["observed", "expected", "ppi_lwr", "ppi_upr"],
    formatAs: "number",
    periodColumn: "period_id",
    presets: [preset("timeseries", { specialDisruptionsChartV2: true })],
  }),
  metric({
    id: "m6-02-01",
    moduleId: "m006",
    dims: ["indicator_common_id", "admin_area_2", "year"],
    required: ["indicator_common_id", "admin_area_2", "year"],
    valueProps: [
      "coverage_original_estimate",
      "coverage_avgsurveyprojection",
      "coverage_cov",
    ],
    periodColumn: "year",
    presets: [
      preset("timeseries", { specialCoverageChart: true }),
      preset("chart", {
        colorScale: "single-grey",
        sortIndicatorValues: "descending",
      }),
    ],
  }),
  metric({
    id: "m6-03-01",
    moduleId: "m006",
    dims: ["indicator_common_id", "admin_area_3", "year"],
    required: ["indicator_common_id", "admin_area_3", "year"],
    valueProps: [
      "coverage_original_estimate",
      "coverage_avgsurveyprojection",
      "coverage_cov",
    ],
    periodColumn: "year",
  }),
  metric({
    id: "m4a-01-01",
    moduleId: "m005",
    dims: ["denominator", "year"],
    required: ["denominator", "year"],
    formatAs: "number",
    periodColumn: "year",
  }),
  metric({
    id: "m4a-01-02",
    moduleId: "m005",
    dims: ["denominator", "admin_area_2", "year"],
    required: ["denominator", "admin_area_2", "year"],
    formatAs: "number",
    periodColumn: "year",
  }),
  metric({
    id: "m4a-01-03",
    moduleId: "m005",
    dims: ["denominator", "admin_area_3", "year"],
    required: ["denominator", "admin_area_3", "year"],
    formatAs: "number",
    periodColumn: "year",
  }),
  metric({
    id: "m4a-02-01",
    moduleId: "m005",
    dims: ["denominator_best_or_survey", "indicator_common_id", "year"],
    required: ["denominator_best_or_survey", "indicator_common_id", "year"],
    periodColumn: "year",
  }),
  metric({
    id: "m4a-02-02",
    moduleId: "m005",
    dims: [
      "denominator_best_or_survey",
      "indicator_common_id",
      "admin_area_2",
      "year",
    ],
    required: [
      "denominator_best_or_survey",
      "indicator_common_id",
      "admin_area_2",
      "year",
    ],
    periodColumn: "year",
  }),
  metric({
    id: "m4a-02-03",
    moduleId: "m005",
    dims: [
      "denominator_best_or_survey",
      "indicator_common_id",
      "admin_area_3",
      "year",
    ],
    required: [
      "denominator_best_or_survey",
      "indicator_common_id",
      "admin_area_3",
      "year",
    ],
    periodColumn: "year",
  }),
  metric({
    id: "m10-01-01",
    moduleId: "m010",
    dims: [
      "hfa_indicator",
      "hfa_category",
      "admin_area_2",
      "admin_area_3",
      "time_point",
    ],
    required: ["hfa_indicator", "time_point"],
    formatAs: "indicator",
    presets: [preset("table", { cfMode: "thresholds" })],
  }),
  metric({
    id: "m10-01-02",
    moduleId: "m010",
    dims: [
      "hfa_indicator",
      "hfa_category",
      "admin_area_2",
      "admin_area_3",
      "time_point",
    ],
    required: ["hfa_indicator", "time_point"],
    formatAs: "indicator",
  }),
  metric({
    id: "m9-01-01",
    moduleId: "m009",
    dims: ["iceh_indicator", "level", "strat", "year"],
    required: ["iceh_indicator", "level", "year"],
    valueProps: ["estimate"],
    presets: [
      preset("chart", { content: "points-connectors", horizontal: true }),
    ],
  }),
  metric({
    id: "m9-02-01",
    moduleId: "m009",
    dims: ["iceh_indicator", "strat", "year"],
    required: ["iceh_indicator", "strat", "year"],
    valueProps: ["ratio", "difference", "cix", "sii"],
    formatAs: "number",
  }),
];

function context(metrics: MetricWithStatus[] = METRICS): RunAuthoringContext {
  return {
    runId: "run",
    scopeToken: "token",
    modules: [
      module("m001", "hmis"),
      module("m012", "hmis"),
      module("m002", "hmis"),
      module("m011", "hmis"),
      module("m006", "hmis"),
      module("m005", "hmis"),
      module("m010", "hfa"),
      module("m009", "iceh"),
    ],
    metrics,
    datasets: [],
    hmisIndicators: [{ id: "anc1", label: "ANC 1" }, {
      id: "anc4",
      label: "ANC 4",
    }],
    icehIndicators: [{ id: "cov1", label: "Cov 1", category: "c" }],
    hfaTaxonomy: {
      indicators: [
        { id: "hfa1", label: "HFA 1", categoryId: "c1" },
        { id: "hfa2", label: "HFA 2", categoryId: "c2" },
      ],
    },
    presets: [],
    population: null,
  } as unknown as RunAuthoringContext;
}

const CTX = context();

function ok(ids: string[]): ExplorePossibleValues[DisaggregationOption] {
  return { status: "ok", values: ids.map((id) => ({ id, label: id })) };
}

const PV: ExplorePossibleValues = {
  admin_area_2: ok(["Kano", "Lagos"]),
  admin_area_3: ok(["Dala", "Fagge"]),
  time_point: ok(["Round 1", "Round 2"]),
  year: ok(["2018", "2013"]),
  strat: ok(["wealth_quintiles", "residence"]),
  hfa_category: ok(["c1", "c2"]),
  denominator: ok(["dhis2", "un"]),
  level: ok(["Q1", "Q5"]),
  ratio_type: ok(["pair_anc", "pair_pnc"]),
};

// Bindings

function bound(moduleId: string, viewId: string): ExploreViewBinding {
  const binding = EXPLORE_VIEWS[moduleId]?.find((b) => b.id === viewId);
  if (binding === undefined) {
    throw new Error(`No binding ${moduleId}/${viewId}`);
  }
  return binding;
}

const M012 = bound("m012", "service_counts");
const M001_CONSISTENCY = bound("m001", "consistency");
const M001_DQA = bound("m001", "dqa_adequate");
const M002_SWITCH = bound("m002", "adjustment_impact");
const M011 = bound("m011", "disruptions");
const M005_DENOM = bound("m005", "denominators");
const M005_BY_AREA = bound("m005", "denominators_by_area");
const M005_BY_DENOM = bound("m005", "coverage_by_denominator");

const M012_MAP: ExploreViewBinding = {
  ...M012,
  types: [...M012.types, { type: "map" }],
};

const M012_BY_TIME: ExploreViewBinding = {
  ...M012,
  types: [{ type: "table", rows: "area", cols: "time" }],
};

const M006_BY_AREA: ExploreViewBinding = {
  id: "coverage_by_area",
  label: { en: "Coverage by area", fr: "" },
  metric: { byLevel: { admin_area_2: "m6-02-01", admin_area_3: "m6-03-01" } },
  category: "indicator_common_id",
  types: [
    { type: "table", rows: "area", cols: "category", values: ["coverage_cov"] },
    { type: "chart", axis: "area", values: ["coverage_cov"] },
    { type: "map", values: ["coverage_cov"] },
  ],
};

const M006_OVER_TIME: ExploreViewBinding = {
  id: "coverage_over_time",
  label: { en: "Coverage over time", fr: "" },
  metric: { byLevel: { admin_area_2: "m6-02-01", admin_area_3: "m6-03-01" } },
  category: "indicator_common_id",
  types: [{ type: "timeseries" }],
};

const M010_ROUND: ExploreViewBinding = {
  id: "hfa_by_round",
  label: { en: "Indicators by survey round", fr: "" },
  metric: {
    switch: {
      label: { en: "Values", fr: "" },
      options: [
        {
          id: "observed",
          label: { en: "Observed", fr: "" },
          metricId: "m10-01-01",
        },
        {
          id: "carried",
          label: { en: "With carry-forward", fr: "" },
          metricId: "m10-01-02",
        },
      ],
    },
  },
  category: "hfa_indicator",
  facets: ["hfa_category"],
  types: [{ type: "table", rows: "category", cols: "time" }],
};

const M010_AREA: ExploreViewBinding = {
  ...M010_ROUND,
  id: "hfa_by_area",
  types: [{ type: "table", rows: "area", cols: "category" }],
};

const M009_COV: ExploreViewBinding = {
  id: "iceh_coverage",
  label: { en: "Coverage by population group", fr: "" },
  metric: { id: "m9-01-01" },
  unit: "level",
  category: "iceh_indicator",
  facets: ["strat"],
  types: [
    { type: "table", rows: "unit", cols: "category" },
    { type: "chart", axis: "category", series: "unit" },
    { type: "timeseries", series: "unit" },
  ],
};

const M009_INEQ: ExploreViewBinding = {
  id: "iceh_inequality",
  label: { en: "Inequality measures", fr: "" },
  metric: { id: "m9-02-01" },
  category: "iceh_indicator",
  facets: ["strat"],
  types: [
    { type: "table", rows: "category", cols: "values" },
    { type: "chart", axis: "category", values: ["cix"] },
    { type: "timeseries", values: ["cix"] },
  ],
};

function resolve(
  binding: ExploreViewBinding,
  family: DatasetType,
  overrides: Partial<ResolveViewInput> = {},
) {
  const view = resolveView({
    binding,
    family,
    type: undefined,
    query: undefined,
    choices: undefined,
    scopeArea: NATIONAL,
    ctx: CTX,
    possibleValues: PV,
    ...overrides,
  });
  if (view === undefined) throw new Error("No view resolved");
  return view;
}

function derive(
  binding: ExploreViewBinding,
  family: DatasetType,
  overrides: Partial<ResolveViewInput> = {},
) {
  return deriveViewConfig(resolve(binding, family, overrides), "en");
}

const ALL = { kind: "values" as const, values: [] };
const LAST_12 = {
  kind: "window" as const,
  filter: { filterType: "last_n_months" as const, nMonths: 12 },
};
const ROWS_AA2 = {
  disOpt: "admin_area_2",
  disDisplayOpt: "row",
  rollup: true,
  rollupPosition: "top",
} as const;

// Level (R10)

Deno.test("level: m012 opens at admin area 2 under All data and 3 under an area, laid out", () => {
  const national = resolve(M012, "hmis");
  assertEquals(national.area, {
    placement: "laid_out",
    level: "admin_area_2",
    levels: ["admin_area_2", "admin_area_3", "admin_area_4"],
    dimension: "admin_area_2",
    byLevel: false,
  });
  assertEquals(national.query, {
    level: "admin_area_2",
    indicators: [],
    period: ALL,
    grain: "period_id",
  });
  const scoped = resolve(M012, "hmis", { scopeArea: KANO });
  assertEquals(scoped.area?.level, "admin_area_3");
  assertEquals(scoped.area?.levels, ["admin_area_3", "admin_area_4"]);
});

Deno.test("level: a level the metric does not carry clamps to the shallowest offered", () => {
  const ctx = context([
    metric({
      id: "m12-01-01",
      moduleId: "m012",
      dims: [
        "indicator_common_id",
        "admin_area_2",
        "admin_area_3",
        "period_id",
      ],
      periodColumn: "period_id",
    }),
  ]);
  const query = {
    level: "admin_area_4" as const,
    indicators: [],
    period: ALL,
    grain: "period_id" as const,
  };
  assertEquals(
    resolve(M012, "hmis", { ctx, query }).area?.level,
    "admin_area_2",
  );
  assertEquals(
    resolve(M012, "hmis", { ctx, query, scopeArea: KANO }).area?.level,
    "admin_area_3",
  );
});

Deno.test("level: byLevel offers national only without a scope area, and the area pinned deeper or equal", () => {
  const national = resolve(M011, "hmis");
  assertEquals(national.area?.levels, ["national", "admin_area_2"]);
  assertEquals(national.area?.level, "national");
  assertEquals(national.metric.id, "m11-01-01");
  assertEquals(national.area?.dimension, undefined);
  assertEquals(national.area?.placement, "dropped");
  assertEquals(national.pins, []);

  const scoped = resolve(M011, "hmis", { scopeArea: KANO });
  assertEquals(scoped.area?.levels, ["admin_area_2"]);
  assertEquals(scoped.metric.id, "m11-01-02");
  assertEquals(scoped.area?.placement, "pinned");

  const chosen = resolve(M011, "hmis", {
    query: {
      level: "admin_area_2",
      indicators: [],
      period: ALL,
      grain: "period_id",
    },
  });
  assertEquals(chosen.metric.id, "m11-01-02");
  assertEquals(chosen.area?.byLevel, true);
});

Deno.test("level: a byLevel option whose metric the package lacks is not offered", () => {
  const ctx = context(METRICS.filter((m) => m.id !== "m6-03-01"));
  assertEquals(resolve(M006_BY_AREA, "hmis", { ctx }).area?.levels, [
    "admin_area_2",
  ]);
  assertEquals(
    resolve(M006_BY_AREA, "hmis", { ctx }).area?.levels,
    ["admin_area_2"],
  );
  assertEquals(
    resolveView({
      binding: M006_BY_AREA,
      family: "hmis",
      type: undefined,
      query: undefined,
      choices: undefined,
      scopeArea: KANO,
      ctx,
      possibleValues: PV,
    }),
    undefined,
  );
});

// Pin (R-pin, R8)

Deno.test("pin: the m012 timeseries drops the area, the m011 admin-area-2 view pins it as the replicant", () => {
  const dropped = resolve(M012, "hmis", { type: "timeseries" });
  assertEquals(dropped.area, undefined);
  assertEquals(dropped.query.level, "admin_area_2");
  assertEquals(dropped.pins, []);
  assertEquals(
    deriveViewConfig(dropped, "en")?.config.d.disaggregateBy,
    [{ disOpt: "indicator_common_id", disDisplayOpt: "cell" }],
  );

  const pinned = resolve(M011, "hmis", { scopeArea: KANO });
  assertEquals(pinned.pins, [{
    dimension: "admin_area_2",
    role: "area",
    status: "ok",
    options: [{ id: "Kano", label: "Kano" }, { id: "Lagos", label: "Lagos" }],
    value: "Kano",
    replicant: true,
  }]);
  const config = deriveViewConfig(pinned, "en")?.config;
  assertEquals(config?.d.disaggregateBy, [
    { disOpt: "indicator_common_id", disDisplayOpt: "cell" },
    { disOpt: "admin_area_2", disDisplayOpt: "replicant" },
  ]);
  assertEquals(config?.d.selectedReplicantValue, "Kano");
  assertEquals(
    resolve(M011, "hmis", {
      scopeArea: KANO,
      choices: { pinned: { admin_area_2: "Lagos" } },
    })
      .pins[0].value,
    "Lagos",
  );
});

Deno.test("pin: a required non-time facet is the replicant, an optional one a filter", () => {
  const required = resolve(M009_INEQ, "iceh");
  assertEquals(required.pins[0].replicant, true);
  const requiredConfig = deriveViewConfig(required, "en")?.config.d;
  assertEquals(requiredConfig?.disaggregateBy, [
    { disOpt: "iceh_indicator", disDisplayOpt: "row" },
    { disOpt: "strat", disDisplayOpt: "replicant" },
  ]);
  assertEquals(requiredConfig?.selectedReplicantValue, "wealth_quintiles");
  assertEquals(requiredConfig?.valuesDisDisplayOpt, "col");

  const optional = resolve(M009_COV, "iceh");
  assertEquals(optional.pins[0].replicant, false);
  assertEquals(deriveViewConfig(optional, "en")?.config.d.filterBy, [
    { disOpt: "strat", values: ["wealth_quintiles"] },
    { disOpt: "year", values: ["2018"] },
  ]);
});

Deno.test("pin: a dimension over the cap has no value and no config (R13)", () => {
  const view = resolve(M009_INEQ, "iceh", {
    possibleValues: { ...PV, strat: { status: "too_many_values" } },
  });
  assertEquals(view.pins[0].status, "too_many_values");
  assertEquals(view.pins[0].value, undefined);
  assertEquals(deriveViewConfig(view, "en"), undefined);
  const pending = resolve(M009_INEQ, "iceh", { possibleValues: {} });
  assertEquals(pending.pins[0].status, "pending");
  assertEquals(deriveViewConfig(pending, "en"), undefined);
});

// Switch and category

Deno.test("switch: only options the package carries are offered, the chosen when among them, else the first", () => {
  const view = resolve(M002_SWITCH, "hmis", {
    choices: { pinned: {}, switch: "both" },
  });
  assertEquals(view.switch?.options.map((o) => o.id), [
    "outliers",
    "completeness",
  ]);
  assertEquals(view.switch?.value, "outliers");
  assertEquals(view.metric.id, "m2-01-01");
  assertEquals(
    resolve(M002_SWITCH, "hmis", {
      choices: { pinned: {}, switch: "completeness" },
    }).metric.id,
    "m2-01-02",
  );
});

Deno.test("category: an indicator the package lacks is dropped and reported, the rest filter", () => {
  const view = resolve(M012, "hmis", {
    query: { indicators: ["anc1", "gone"], period: ALL, grain: "period_id" },
  });
  assertEquals(view.query.indicators, ["anc1"]);
  assertEquals(view.droppedIndicators, ["gone"]);
  assertEquals(view.category?.values, ["anc1"]);
  assertEquals(view.category?.isIndicator, true);
  assertEquals(deriveViewConfig(view, "en")?.config.d.filterBy, [
    { disOpt: "indicator_common_id", values: ["anc1"] },
  ]);
});

Deno.test("category: a non-indicator category offers the possible values and reads the view's own choices", () => {
  const view = resolve(M001_CONSISTENCY, "hmis", {
    query: { indicators: ["anc1"], period: ALL, grain: "period_id" },
    choices: { pinned: {}, category: ["pair_pnc", "gone"] },
  });
  assertEquals(view.category, {
    dimension: "ratio_type",
    placement: "laid_out",
    isIndicator: false,
    options: [
      { id: "pair_anc", label: "pair_anc" },
      { id: "pair_pnc", label: "pair_pnc" },
    ],
    values: ["pair_pnc"],
  });
  assertEquals(view.query.indicators, ["anc1"]);
  const table = deriveViewConfig(view, "en")?.config.d;
  assertEquals(table?.disaggregateBy, [
    ROWS_AA2,
    { disOpt: "ratio_type", disDisplayOpt: "col" },
  ]);
  assertEquals(table?.filterBy, [{
    disOpt: "ratio_type",
    values: ["pair_pnc"],
  }]);
  assertEquals(
    derive(M001_CONSISTENCY, "hmis", { type: "timeseries" })?.config.d
      .disaggregateBy,
    [{ disOpt: "ratio_type", disDisplayOpt: "cell" }],
  );
});

Deno.test("category: a pinned hfa_category facet narrows the HFA indicators (R16)", () => {
  assertEquals(
    resolve(M010_ROUND, "hfa").category?.options.map((o) => o.id),
    ["hfa1"],
  );
  assertEquals(
    resolve(M010_ROUND, "hfa", { choices: { pinned: { hfa_category: "c2" } } })
      .category?.options.map((o) => o.id),
    ["hfa2"],
  );
});

// Time (R9)

Deno.test("time: months laid out take the grain as the column and the window as the filter", () => {
  const query = {
    indicators: [],
    period: LAST_12,
    grain: "quarter_id" as const,
  };
  const table = resolve(M012_BY_TIME, "hmis", { query });
  assertEquals(table.time?.placement, "laid_out");
  assertEquals(table.time?.grainShown, true);
  assertEquals(table.time?.choices.map((c) => c.id), [
    "last_12_months",
    "last_quarter",
    "last_year",
    "all",
  ]);
  // The required indicator dimension has no axis here, so it is pinned as
  // the replicant (R-pin).
  const config = deriveViewConfig(table, "en")?.config.d;
  assertEquals(config?.disaggregateBy, [
    ROWS_AA2,
    { disOpt: "quarter_id", disDisplayOpt: "col" },
    { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
  ]);
  assertEquals(config?.selectedReplicantValue, "anc1");
  assertEquals(config?.periodFilter, LAST_12.filter);

  const lines = deriveViewConfig(
    resolve(M012, "hmis", { query, type: "timeseries" }),
    "en",
  )
    ?.config.d;
  assertEquals(lines?.type, "timeseries");
  assertEquals(lines?.timeseriesGrouping, "quarter_id");
  assertEquals(lines?.periodFilter, LAST_12.filter);
  assertEquals(lines?.filterBy, []);
});

Deno.test("time: months pinned take one window, All pooling every month", () => {
  const windowed = resolve(M012, "hmis", {
    query: { indicators: [], period: LAST_12, grain: "period_id" },
  });
  assertEquals(windowed.time?.placement, "pinned");
  assertEquals(windowed.time?.grainShown, false);
  assertEquals(
    deriveViewConfig(windowed, "en")?.config.d.periodFilter,
    LAST_12.filter,
  );
  const pooled = resolve(M012, "hmis");
  assertEquals(pooled.query.period, ALL);
  assertEquals(
    deriveViewConfig(pooled, "en")?.config.d.periodFilter,
    undefined,
  );
});

Deno.test("time: years laid out take the column and the chosen values, All meaning none", () => {
  const chosen = resolve(M005_DENOM, "hmis", {
    query: {
      indicators: [],
      period: { kind: "values", values: ["2013", "gone"] },
      grain: "period_id",
    },
  });
  assertEquals(chosen.time?.kind, "values");
  assertEquals(chosen.time?.choices.map((c) => c.id), ["2018", "2013", "all"]);
  assertEquals(chosen.query.period, { kind: "values", values: ["2013"] });
  const config = deriveViewConfig(chosen, "en")?.config.d;
  assertEquals(config?.disaggregateBy, [
    { disOpt: "denominator", disDisplayOpt: "row" },
    { disOpt: "year", disDisplayOpt: "col" },
  ]);
  assertEquals(config?.filterBy, [{ disOpt: "year", values: ["2013"] }]);

  const all = resolve(M005_DENOM, "hmis", {
    query: { indicators: [], period: LAST_12, grain: "period_id" },
  });
  assertEquals(all.query.period, ALL);
  assertEquals(deriveViewConfig(all, "en")?.config.d.filterBy, []);
});

Deno.test("time: time points pinned take the latest chosen, else the latest available", () => {
  const latest = resolve(M010_AREA, "hfa");
  assertEquals(latest.query.period, { kind: "values", values: ["Round 2"] });
  assertEquals(latest.time?.choices.map((c) => c.id), ["Round 2", "Round 1"]);
  assertEquals(deriveViewConfig(latest, "en")?.config.d.filterBy, [
    { disOpt: "hfa_category", values: ["c1"] },
    { disOpt: "time_point", values: ["Round 2"] },
  ]);
  const one = resolve(M010_AREA, "hfa", {
    query: {
      indicators: [],
      period: { kind: "values", values: ["Round 1"] },
      grain: "period_id",
    },
  });
  assertEquals(one.query.period, { kind: "values", values: ["Round 1"] });
  const several = resolve(M010_AREA, "hfa", {
    query: {
      indicators: [],
      period: { kind: "values", values: ["Round 2", "Round 1"] },
      grain: "period_id",
    },
  });
  assertEquals(several.query.period, { kind: "values", values: ["Round 2"] });
  const none = resolve(M010_AREA, "hfa", {
    possibleValues: { ...PV, time_point: undefined },
  });
  assertEquals(none.query.period, ALL);
  assertEquals(deriveViewConfig(none, "en"), undefined);
});

Deno.test("time: an over-time type never derives over time points", () => {
  const binding: ExploreViewBinding = {
    ...M010_ROUND,
    types: [{ type: "timeseries" }],
  };
  assertEquals(derive(binding, "hfa"), undefined);
});

// Style (R5) and values (R6)

Deno.test("style: borrowed from the first preset of the same type, else the defaults", () => {
  const table = derive(M012, "hmis")?.config;
  assertEquals(table?.s, { ...DEFAULT_S_CONFIG, cfMode: "indicator" });
  assertEquals(table?.t, DEFAULT_T_CONFIG);

  const lines = derive(M012, "hmis", { type: "timeseries" })?.config.s;
  assertEquals(lines, {
    ...DEFAULT_S_CONFIG,
    cfMode: "indicator",
    content: "lines",
    hideLegend: true,
  });

  const disruptions = derive(M011, "hmis", { scopeArea: KANO })?.config.s;
  assertEquals(disruptions?.specialDisruptionsChartV2, true);
  assertEquals(disruptions?.content, "lines");
  assertEquals(disruptions?.hideLegend, false);

  const chart = derive(M006_BY_AREA, "hmis", { type: "chart" })?.config.s;
  assertEquals(chart?.colorScale, "single-grey");
  assertEquals(chart?.sortIndicatorValues, "descending");
});

Deno.test("values: the type's values narrow the metric's, absent means all", () => {
  assertEquals(
    derive(M006_BY_AREA, "hmis", { type: "chart" })?.config.d.valuesFilter,
    ["coverage_cov"],
  );
  const lines = derive(M006_OVER_TIME, "hmis")?.config;
  assertEquals(lines?.d.valuesFilter, undefined);
  assertEquals(lines?.s.hideLegend, false);
});

// Derived configs, one binding per type

Deno.test("derive: the m012 table is the rolled-up area by indicators", () => {
  assertEquals(derive(M012, "hmis")?.config.d, {
    type: "table",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [ROWS_AA2, {
      disOpt: "indicator_common_id",
      disDisplayOpt: "col",
    }],
    filterBy: [],
  });
});

Deno.test("derive: the m001 DQA table is the rolled-up area by month, its over-time view one line", () => {
  const table = derive(M001_DQA, "hmis")?.config;
  assertEquals(table?.d, {
    type: "table",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [ROWS_AA2, { disOpt: "period_id", disDisplayOpt: "col" }],
    filterBy: [],
  });
  assertEquals(table?.s.cfMode, "thresholds");

  const view = resolve(M001_DQA, "hmis", { type: "timeseries" });
  assertEquals(view.area, undefined);
  assertEquals(view.pins, []);
  const lines = deriveViewConfig(view, "en")?.config;
  assertEquals(lines?.d.disaggregateBy, []);
  assertEquals(lines?.d.timeseriesGrouping, "period_id");
  assertEquals(lines?.s.hideLegend, true);
});

Deno.test("derive: the m012 map pins the indicator as the replicant and the period as the window", () => {
  const view = resolve(M012_MAP, "hmis", {
    type: "map",
    query: { indicators: [], period: LAST_12, grain: "period_id" },
    choices: { pinned: { indicator_common_id: "anc4" } },
  });
  assertEquals(view.category?.placement, "pinned");
  assertEquals(view.pins.map((p) => [p.dimension, p.value, p.replicant]), [
    ["indicator_common_id", "anc4", true],
  ]);
  assertEquals(view.pins[0].options, [
    { id: "anc1", label: "ANC 1" },
    { id: "anc4", label: "ANC 4" },
  ]);
  assertEquals(deriveViewConfig(view, "en")?.config.d, {
    type: "map",
    valuesDisDisplayOpt: "cell",
    disaggregateBy: [
      { disOpt: "admin_area_2", disDisplayOpt: "mapArea" },
      { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
    ],
    filterBy: [],
    periodFilter: LAST_12.filter,
    selectedReplicantValue: "anc4",
  });
});

Deno.test("derive: the m011 admin-area-2 timeseries is panes by indicator, lines the four values", () => {
  const config = derive(M011, "hmis", { scopeArea: KANO })?.config;
  assertEquals(config?.d, {
    type: "timeseries",
    valuesDisDisplayOpt: "series",
    disaggregateBy: [
      { disOpt: "indicator_common_id", disDisplayOpt: "cell" },
      { disOpt: "admin_area_2", disDisplayOpt: "replicant" },
    ],
    filterBy: [],
    timeseriesGrouping: "period_id",
    selectedReplicantValue: "Kano",
  });
});

Deno.test("derive: the m006 chart is bars by area with the indicator pinned and the latest year", () => {
  const view = resolve(M006_BY_AREA, "hmis", { type: "chart" });
  assertEquals(view.area?.placement, "laid_out");
  assertEquals(deriveViewConfig(view, "en")?.config.d, {
    type: "chart",
    valuesDisDisplayOpt: "series",
    disaggregateBy: [
      { disOpt: "admin_area_2", disDisplayOpt: "indicator" },
      { disOpt: "indicator_common_id", disDisplayOpt: "replicant" },
    ],
    filterBy: [{ disOpt: "year", values: ["2018"] }],
    valuesFilter: ["coverage_cov"],
    selectedReplicantValue: "anc1",
  });
});

Deno.test("derive: the m009 equiplot is indicators by population group, the stratifier filtered", () => {
  const chart = derive(M009_COV, "iceh", { type: "chart" })?.config;
  assertEquals(chart?.d, {
    type: "chart",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [
      { disOpt: "iceh_indicator", disDisplayOpt: "indicator" },
      { disOpt: "level", disDisplayOpt: "series" },
    ],
    filterBy: [
      { disOpt: "strat", values: ["wealth_quintiles"] },
      { disOpt: "year", values: ["2018"] },
    ],
  });
  assertEquals(chart?.s.content, "points-connectors");
  assertEquals(chart?.s.horizontal, true);

  const lines = derive(M009_COV, "iceh", { type: "timeseries" })?.config;
  assertEquals(lines?.d.timeseriesGrouping, "year");
  assertEquals(lines?.d.disaggregateBy, [
    { disOpt: "iceh_indicator", disDisplayOpt: "cell" },
    { disOpt: "level", disDisplayOpt: "series" },
  ]);
  assertEquals(lines?.d.valuesDisDisplayOpt, "col");
  assertEquals(lines?.s.hideLegend, false);
});

Deno.test("derive: m010 hfa_by_round is indicators by round under the category facet and the switch", () => {
  const view = resolve(M010_ROUND, "hfa");
  assertEquals(view.switch?.value, "observed");
  assertEquals(view.metric.id, "m10-01-01");
  assertEquals(deriveViewConfig(view, "en")?.config.d, {
    type: "table",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [
      { disOpt: "hfa_indicator", disDisplayOpt: "row" },
      { disOpt: "time_point", disDisplayOpt: "col" },
    ],
    filterBy: [{ disOpt: "hfa_category", values: ["c1"] }],
  });
  assertEquals(
    resolve(M010_ROUND, "hfa", { choices: { pinned: {}, switch: "carried" } })
      .metric.id,
    "m10-01-02",
  );
});

Deno.test("derive: m005 denominators is the unit by years, nothing pinned", () => {
  const view = resolve(M005_DENOM, "hmis");
  assertEquals(view.pins, []);
  assertEquals(view.unit, { dimension: "denominator", placement: "laid_out" });
  assertEquals(deriveViewConfig(view, "en")?.config.d, {
    type: "table",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [
      { disOpt: "denominator", disDisplayOpt: "row" },
      { disOpt: "year", disDisplayOpt: "col" },
    ],
    filterBy: [],
  });
});

Deno.test("derive: m005 denominators_by_area is the rolled-up area by year, the denominator the replicant", () => {
  const view = resolve(M005_BY_AREA, "hmis");
  assertEquals(view.area?.levels, ["admin_area_2", "admin_area_3"]);
  assertEquals(view.metric.id, "m4a-01-02");
  assertEquals(
    view.pins.map((p) => [p.dimension, p.role, p.value, p.replicant]),
    [["denominator", "facet", "dhis2", true]],
  );
  assertEquals(deriveViewConfig(view, "en")?.config.d, {
    type: "table",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [
      ROWS_AA2,
      { disOpt: "year", disDisplayOpt: "col" },
      { disOpt: "denominator", disDisplayOpt: "replicant" },
    ],
    filterBy: [],
    selectedReplicantValue: "dhis2",
  });
  const scoped = resolve(M005_BY_AREA, "hmis", { scopeArea: KANO });
  assertEquals(scoped.area?.levels, ["admin_area_3"]);
  assertEquals(scoped.metric.id, "m4a-01-03");
});

Deno.test("derive: m005 coverage_by_denominator is denominator types by indicator at one year, or lines by type over time with the area the replicant", () => {
  const national = resolve(M005_BY_DENOM, "hmis");
  assertEquals(national.area?.levels, [
    "national",
    "admin_area_2",
    "admin_area_3",
  ]);
  assertEquals(national.metric.id, "m4a-02-01");
  assertEquals(national.pins, []);
  assertEquals(national.time?.placement, "pinned");
  assertEquals(deriveViewConfig(national, "en")?.config.d, {
    type: "table",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [
      { disOpt: "denominator_best_or_survey", disDisplayOpt: "row" },
      { disOpt: "indicator_common_id", disDisplayOpt: "col" },
    ],
    filterBy: [{ disOpt: "year", values: ["2018"] }],
  });

  const lines = resolve(M005_BY_DENOM, "hmis", {
    type: "timeseries",
    query: {
      level: "admin_area_2",
      indicators: [],
      period: ALL,
      grain: "period_id",
    },
  });
  assertEquals(lines.metric.id, "m4a-02-02");
  assertEquals(lines.unit, {
    dimension: "denominator_best_or_survey",
    placement: "laid_out",
  });
  const config = deriveViewConfig(lines, "en")?.config;
  assertEquals(config?.d, {
    type: "timeseries",
    valuesDisDisplayOpt: "col",
    disaggregateBy: [
      { disOpt: "indicator_common_id", disDisplayOpt: "cell" },
      { disOpt: "denominator_best_or_survey", disDisplayOpt: "series" },
      { disOpt: "admin_area_2", disDisplayOpt: "replicant" },
    ],
    filterBy: [],
    timeseriesGrouping: "year",
    selectedReplicantValue: "Kano",
  });
  assertEquals(config?.s.hideLegend, false);
});

// Types and views

Deno.test("type: the chosen type when the view offers it, else the first", () => {
  assertEquals(resolve(M012, "hmis", { type: "map" }).type.type, "table");
  assertEquals(
    resolve(M012, "hmis", { type: "timeseries" }).type.type,
    "timeseries",
  );
});

Deno.test("views: a view is offered only for metrics the package carries (R7)", () => {
  const m012 = { ...module("m012", "hmis") };
  assertEquals(viewsForModule(m012, CTX).map((v) => v.id), ["service_counts"]);
  const unavailable = context(
    METRICS.map((m) =>
      m.id === "m12-01-01" ? { ...m, status: "unavailable" as const } : m
    ),
  );
  assertEquals(viewsForModule(m012, unavailable), []);
  assertEquals(viewsForModule(module("m001", "hmis"), CTX).map((v) => v.id), [
    "consistency",
    "dqa_adequate",
  ]);
});

Deno.test("periods: the choice id of a period, none for an unoffered one", () => {
  const choices = resolve(M012, "hmis").time?.choices ?? [];
  assertEquals(periodChoiceId(ALL, choices), "all");
  assertEquals(periodChoiceId(LAST_12, choices), "last_12_months");
  assertEquals(
    periodChoiceId({ kind: "values", values: ["201801"] }, choices),
    undefined,
  );
});
