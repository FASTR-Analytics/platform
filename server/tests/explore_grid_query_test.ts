// Harness for the Explore Data table's query model: defaults per scope,
// resolution, and the derived disaggregation per family and columns mode.
//
//   deno test -A server/tests/explore_grid_query_test.ts

import { assertEquals } from "@std/assert";
import {
  defaultGridQuery,
  deriveGridConfig,
  deriveTimeseriesConfig,
  type GridColumns,
  type DatasetType,
  type DisaggregationOption,
  type GridAvailable,
  type GridQuery,
  type MetricWithStatus,
  type PackageScope,
  periodChoicesFor,
  resolveGridQuery,
  type RunAuthoringContext,
  type VizPreset,
} from "lib";

const NATIONAL: PackageScope = { runId: "run", adminArea2: null };
const KANO: PackageScope = { runId: "run", adminArea2: "Kano" };

const AVAILABLE: GridAvailable = {
  hfaTimePoints: ["Round 1", "Round 2"],
  icehYears: ["2013", "2018"],
  icehStrats: ["wealth_quintiles", "residence"],
};

const PRESET = {
  id: "p",
  label: "p",
  config: {
    d: {
      type: "table",
      valuesDisDisplayOpt: "col",
      disaggregateBy: [],
      filterBy: [],
    },
    s: { decimalPlaces: 1 },
    t: {
      caption: null,
      captionRelFontSize: null,
      subCaption: null,
      subCaptionRelFontSize: null,
      footnote: null,
      footnoteRelFontSize: null,
    },
  },
} as unknown as VizPreset;

function metric(
  id: string,
  moduleId: string,
  options: DisaggregationOption[],
): MetricWithStatus {
  return {
    id,
    moduleId,
    status: "ready",
    label: id,
    formatAs: "percent",
    valueProps: ["value"],
    valueFunc: "identity",
    resultsObjectId: `${id}.csv`,
    mostGranularTimePeriodColumnInResultsFile: undefined,
    disaggregationOptions: options.map((value) => ({
      value,
      isRequired: false,
    })),
    vizPresets: [PRESET],
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

function context(opts: { families: DatasetType[]; hmisLevels?: DisaggregationOption[] }): RunAuthoringContext {
  const all = {
    hmis: {
      module: module("m012", "hmis"),
      metric: metric("m12-01-01", "m012", [
        "indicator_common_id",
        ...(opts.hmisLevels ?? ["admin_area_2", "admin_area_3", "admin_area_4"]),
        "period_id",
      ]),
    },
    hfa: {
      module: module("m010", "hfa"),
      metric: metric("m10-01-01", "m010", [
        "hfa_indicator",
        "admin_area_2",
        "admin_area_3",
        "time_point",
      ]),
    },
    iceh: {
      module: module("m009", "iceh"),
      metric: metric("m9-01-01", "m009", ["iceh_indicator", "level", "strat", "year"]),
    },
  };
  return {
    runId: "run",
    modules: opts.families.map((f) => all[f].module),
    metrics: opts.families.map((f) => all[f].metric),
    datasets: [],
    hmisIndicators: [{ id: "anc1" }, { id: "anc4" }],
    icehIndicators: [{ id: "cov1", label: "Cov 1", category: "c" }],
    hfaTaxonomy: { indicators: [{ id: "hfa1" }] },
    presets: [],
    population: null,
  } as unknown as RunAuthoringContext;
}

const CTX = context({ families: ["hmis", "hfa", "iceh"] });

function disaggregateBy(query: GridQuery, columns: GridColumns = "indicators", ctx = CTX) {
  return deriveGridConfig(query, columns, ctx, "en")?.config.d.disaggregateBy;
}

function filterBy(query: GridQuery, columns: GridColumns = "indicators", ctx = CTX) {
  return deriveGridConfig(query, columns, ctx, "en")?.config.d.filterBy;
}

// Defaults

Deno.test("default: HMIS national opens at level 2 on the last 12 months", () => {
  assertEquals(defaultGridQuery("hmis", NATIONAL, CTX, AVAILABLE), {
    family: "hmis",
    unit: { kind: "admin", level: "admin_area_2" },
    indicators: [],
    period: { kind: "window", filter: { filterType: "last_n_months", nMonths: 12 } },
    grain: "period_id",
  });
});

Deno.test("default: HMIS under an admin area 2 scope opens at level 3", () => {
  assertEquals(defaultGridQuery("hmis", KANO, CTX, AVAILABLE).unit, {
    kind: "admin",
    level: "admin_area_3",
  });
});

Deno.test("default: HFA opens on its latest time point at the scope's level plus one", () => {
  const national = defaultGridQuery("hfa", NATIONAL, CTX, AVAILABLE);
  assertEquals(national.unit, { kind: "admin", level: "admin_area_2" });
  assertEquals(national.period, { kind: "values", values: ["Round 2"] });
  assertEquals(defaultGridQuery("hfa", KANO, CTX, AVAILABLE).unit, {
    kind: "admin",
    level: "admin_area_3",
  });
});

Deno.test("default: ICEH opens on the first stratifier and the latest year under any scope", () => {
  for (const scope of [NATIONAL, KANO]) {
    const q = defaultGridQuery("iceh", scope, CTX, AVAILABLE);
    assertEquals(q.unit, { kind: "strat", strat: "wealth_quintiles" });
    assertEquals(q.period, { kind: "values", values: ["2018"] });
  }
});

// Resolution

Deno.test("resolve: an indicator missing from the dictionary is dropped and reported", () => {
  const q = { ...defaultGridQuery("hmis", NATIONAL, CTX, AVAILABLE), indicators: ["anc1", "gone"] };
  const r = resolveGridQuery(q, "indicators", NATIONAL, CTX, AVAILABLE);
  assertEquals(r.query.indicators, ["anc1"]);
  assertEquals(r.droppedIndicators, ["gone"]);
});

Deno.test("resolve: a level deeper than the metric offers clamps to the shallowest valid", () => {
  const ctx = context({ families: ["hmis"], hmisLevels: ["admin_area_2", "admin_area_3"] });
  const q: GridQuery = {
    ...defaultGridQuery("hmis", NATIONAL, ctx, AVAILABLE),
    unit: { kind: "admin", level: "admin_area_4" },
  };
  assertEquals(resolveGridQuery(q, "indicators", NATIONAL, ctx, AVAILABLE).query.unit, {
    kind: "admin",
    level: "admin_area_2",
  });
  assertEquals(resolveGridQuery(q, "indicators", KANO, ctx, AVAILABLE).query.unit, {
    kind: "admin",
    level: "admin_area_3",
  });
});

Deno.test("resolve: level 2 under an admin area 2 scope moves deeper", () => {
  const q = defaultGridQuery("hfa", NATIONAL, CTX, AVAILABLE);
  assertEquals(resolveGridQuery(q, "indicators", KANO, CTX, AVAILABLE).query.unit, {
    kind: "admin",
    level: "admin_area_3",
  });
});

Deno.test("resolve: a family the package does not offer maps to the first offered", () => {
  const ctx = context({ families: ["hfa", "iceh"] });
  const q = defaultGridQuery("hmis", NATIONAL, CTX, AVAILABLE);
  assertEquals(resolveGridQuery(q, "indicators", NATIONAL, ctx, AVAILABLE).query.family, "hfa");
});

Deno.test("resolve: an unknown stratifier maps to the first", () => {
  const q: GridQuery = {
    ...defaultGridQuery("iceh", NATIONAL, CTX, AVAILABLE),
    unit: { kind: "strat", strat: "gone" },
  };
  assertEquals(resolveGridQuery(q, "indicators", NATIONAL, CTX, AVAILABLE).query.unit, {
    kind: "strat",
    strat: "wealth_quintiles",
  });
});

Deno.test("resolve: HFA and ICEH Indicators mode read exactly one period", () => {
  for (const family of ["hfa", "iceh"] as const) {
    const base = defaultGridQuery(family, NATIONAL, CTX, AVAILABLE);
    const all = resolveGridQuery({ ...base, period: { kind: "values", values: [] } }, "indicators", NATIONAL, CTX, AVAILABLE);
    assertEquals(all.query.period.kind === "values" && all.query.period.values.length, 1);
    const several = resolveGridQuery(
      { ...base, period: { kind: "values", values: [...(family === "hfa" ? AVAILABLE.hfaTimePoints : AVAILABLE.icehYears)].reverse() } }, "indicators",
      NATIONAL,
      CTX,
      AVAILABLE,
    );
    assertEquals(
      several.query.period,
      { kind: "values", values: [family === "hfa" ? "Round 2" : "2018"] },
    );
  }
});

Deno.test("resolve: HFA Time mode keeps every chosen time point, and empty stays all", () => {
  const base = defaultGridQuery("hfa", NATIONAL, CTX, AVAILABLE);
  assertEquals(
    resolveGridQuery({ ...base, period: { kind: "values", values: ["Round 1", "Round 2", "Gone"] } }, "time", NATIONAL, CTX, AVAILABLE).query.period,
    { kind: "values", values: ["Round 1", "Round 2"] },
  );
  assertEquals(
    resolveGridQuery({ ...base, period: { kind: "values", values: [] } }, "time", NATIONAL, CTX, AVAILABLE).query.period,
    { kind: "values", values: [] },
  );
});

// Derivation

Deno.test("derive: HMIS and HFA Indicators mode is the rolled-up unit by indicators", () => {
  for (const [family, dim] of [["hmis", "indicator_common_id"], ["hfa", "hfa_indicator"]] as const) {
    const q = resolveGridQuery(defaultGridQuery(family, NATIONAL, CTX, AVAILABLE), "indicators", NATIONAL, CTX, AVAILABLE).query;
    assertEquals(disaggregateBy(q), [
      { disOpt: "admin_area_2", disDisplayOpt: "row", rollup: true, rollupPosition: "top" },
      { disOpt: dim, disDisplayOpt: "col" },
    ]);
  }
});

Deno.test("derive: HMIS Time mode puts the grain in columns and indicators in column groups", () => {
  const q: GridQuery = { ...defaultGridQuery("hmis", NATIONAL, CTX, AVAILABLE), grain: "quarter_id" };
  assertEquals(disaggregateBy(q, "time"), [
    { disOpt: "admin_area_2", disDisplayOpt: "row", rollup: true, rollupPosition: "top" },
    { disOpt: "quarter_id", disDisplayOpt: "col" },
    { disOpt: "indicator_common_id", disDisplayOpt: "colGroup" },
  ]);
  const config = deriveGridConfig(q, "time", CTX, "en")?.config;
  assertEquals(config?.d.type, "table");
  assertEquals(config?.d.periodFilter, { filterType: "last_n_months", nMonths: 12 });
});

Deno.test("derive: HFA Time mode uses time points and filters the chosen ones", () => {
  const q: GridQuery = {
    ...defaultGridQuery("hfa", NATIONAL, CTX, AVAILABLE),
    indicators: ["hfa1"],
    period: { kind: "values", values: ["Round 1"] },
  };
  assertEquals(disaggregateBy(q, "time")?.map((d) => [d.disOpt, d.disDisplayOpt]), [
    ["admin_area_2", "row"],
    ["time_point", "col"],
    ["hfa_indicator", "colGroup"],
  ]);
  assertEquals(filterBy(q, "time"), [
    { disOpt: "hfa_indicator", values: ["hfa1"] },
    { disOpt: "time_point", values: ["Round 1"] },
  ]);
});

Deno.test("derive: HFA Indicators mode filters its one time point", () => {
  const q = defaultGridQuery("hfa", NATIONAL, CTX, AVAILABLE);
  assertEquals(filterBy(q), [{ disOpt: "time_point", values: ["Round 2"] }]);
  assertEquals(
    deriveGridConfig({ ...q, period: { kind: "values", values: [] } }, "indicators", CTX, "en"),
    undefined,
  );
});

Deno.test("derive: ICEH rows are the stratifier's levels, never rolled up", () => {
  const q = defaultGridQuery("iceh", NATIONAL, CTX, AVAILABLE);
  assertEquals(disaggregateBy(q), [
    { disOpt: "level", disDisplayOpt: "row" },
    { disOpt: "iceh_indicator", disDisplayOpt: "col" },
  ]);
  assertEquals(disaggregateBy({ ...q, period: { kind: "values", values: [] } }, "time"), [
    { disOpt: "level", disDisplayOpt: "row" },
    { disOpt: "year", disDisplayOpt: "col" },
    { disOpt: "iceh_indicator", disDisplayOpt: "colGroup" },
  ]);
});

Deno.test("derive: ICEH filters the chosen stratifier and its one year", () => {
  const q = defaultGridQuery("iceh", NATIONAL, CTX, AVAILABLE);
  assertEquals(filterBy(q), [
    { disOpt: "strat", values: ["wealth_quintiles"] },
    { disOpt: "year", values: ["2018"] },
  ]);
  assertEquals(deriveGridConfig(q, "indicators", CTX, "en")?.config.d.periodFilter, undefined);
});

Deno.test("derive: HMIS timeseries is lines over the grain with a pane per indicator", () => {
  const q: GridQuery = { ...defaultGridQuery("hmis", NATIONAL, CTX, AVAILABLE), grain: "quarter_id" };
  const config = deriveTimeseriesConfig(q, CTX, "en")?.config;
  assertEquals(config?.d.type, "timeseries");
  assertEquals(config?.d.timeseriesGrouping, "quarter_id");
  assertEquals(config?.d.valuesDisDisplayOpt, "series");
  assertEquals(config?.d.disaggregateBy, [{ disOpt: "indicator_common_id", disDisplayOpt: "cell" }]);
  assertEquals(config?.d.filterBy, []);
  assertEquals(config?.d.periodFilter, { filterType: "last_n_months", nMonths: 12 });
  assertEquals(config?.s.content, "lines");
  assertEquals(config?.s.nColsInCellDisplay, 3);
  assertEquals(deriveTimeseriesConfig(defaultGridQuery("hfa", NATIONAL, CTX, AVAILABLE), CTX, "en"), undefined);
});

Deno.test("periods: HFA and ICEH offer All only in Time mode", () => {
  const ids = (family: DatasetType, columns: "indicators" | "time") =>
    periodChoicesFor(family, columns, AVAILABLE).map((c) => c.id);
  assertEquals(ids("hfa", "indicators"), ["Round 2", "Round 1"]);
  assertEquals(ids("hfa", "time"), ["Round 2", "Round 1", "all"]);
  assertEquals(ids("iceh", "indicators"), ["2018", "2013"]);
  assertEquals(ids("hmis", "indicators"), ["last_12_months", "last_quarter", "last_year", "all"]);
});
