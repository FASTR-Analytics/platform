// The figure config's schema: a passing and a refused case for every check
// that needs the config alone, by the shape and by refinement, the preset
// instance's translated texts, and the JSON Schema the copilot's input is
// sent as, closed at every level.
//
//   deno test -A server/tests/figure_config_schema_test.ts

import { assert, assertEquals } from "@std/assert";
import { z } from "zod";
import {
  configAloneProblems,
  type FigureConfig,
  figureConfigPresetSchema,
  type FigureConfigProblem,
  figureConfigSchema,
  figureConfigShapeSchema,
} from "lib";

const TEXT = { title: "", subtitle: "", footnote: "" };

const TABLE: FigureConfig = {
  type: "table",
  data: { filters: [] },
  layout: { row: "admin_area_2", col: "indicator_common_id" },
  style: {
    allowVerticalColHeaders: true,
    showSampleSizes: false,
    hideLegend: false,
    conditionalFormatting: { type: "none" },
    decimalPlaces: 0,
    memberOrder: [],
  },
  text: TEXT,
};

const TIMESERIES: FigureConfig = {
  type: "timeseries",
  data: { filters: [] },
  layout: { period: "period_id", series: "valueProps" },
  style: {
    mode: "standard",
    marks: "lines",
    stacked: false,
    seriesColors: "pastel-discrete",
    colorBy: "series",
    conditionalFormatting: { type: "none" },
    showDataLabels: false,
    hideLegend: false,
    decimalPlaces: 0,
    paneColumns: "auto",
    memberOrder: [],
    valueAxisMaxAt100Percent: false,
    valueAxisMinAuto: false,
    valueAxisLimitsPerTierOrLane: true,
  },
  text: TEXT,
};

const MAP: FigureConfig = {
  type: "map",
  data: { filters: [], valueProps: ["value"] },
  layout: { mapArea: "admin_area_2" },
  style: {
    projection: "equirectangular",
    conditionalFormatting: { type: "none" },
    showMapAreaLabels: false,
    showDataLabels: false,
    labelPlacement: "centroid",
    hideLegend: false,
    decimalPlaces: 0,
    paneColumns: "auto",
    memberOrder: [],
  },
  text: TEXT,
};

const PIE: FigureConfig = {
  type: "pie",
  data: { filters: [] },
  layout: { series: "admin_area_2" },
  style: {
    shape: "pie",
    showCenterValue: false,
    valueAgainst100Percent: false,
    sortByValue: "none",
    groupSlicesBelow: 0,
    seriesColors: "pastel-discrete",
    showDataLabels: false,
    hideLegend: false,
    decimalPlaces: 0,
    paneColumns: "auto",
    memberOrder: [],
  },
  text: TEXT,
};

function fits(value: unknown): boolean {
  return figureConfigSchema.safeParse(value).success;
}

function problemsOf(config: FigureConfig): FigureConfigProblem[] {
  return configAloneProblems(config);
}

Deno.test("the shape", async (t) => {
  await t.step("each type's base config fits", () => {
    assert(fits(TABLE));
    assert(fits(TIMESERIES));
    assert(fits(MAP));
  });
  await t.step("a slot of another type", () => {
    assert(!fits({ ...TABLE, layout: { ...TABLE.layout, series: "year" } }));
  });
  await t.step("a style field of another type", () => {
    assert(
      !fits({ ...TABLE, style: { ...TABLE.style, projection: "mercator" } }),
    );
  });
  await t.step("a style field of another mode", () => {
    assert(
      !fits({ ...TIMESERIES, style: { ...TIMESERIES.style, threshold: 0.1 } }),
    );
    assert(fits({
      ...TIMESERIES,
      style: {
        mode: "coverage",
        valueAxisMaxAt100Percent: false,
        valueAxisMinAuto: false,
        paneColumns: "auto",
        memberOrder: [],
      },
    }));
  });
  await t.step("a slot holds one thing", () => {
    assert(!fits({ ...TABLE, layout: { row: ["admin_area_2", "year"] } }));
  });
  await t.step("a timeseries with no period", () => {
    assert(!fits({ ...TIMESERIES, layout: { series: "valueProps" } }));
  });
  await t.step("a map with no admin-level area", () => {
    assert(!fits({ ...MAP, layout: {} }));
    assert(!fits({ ...MAP, layout: { mapArea: "facility_type" } }));
    assert(fits({ ...MAP, layout: { mapArea: "admin_area_3" } }));
  });
  await t.step("a roll-up on a map or a pie", () => {
    assert(
      !fits({
        ...MAP,
        layout: {
          ...MAP.layout,
          rollup: { dim: "admin_area_2", position: "top" },
        },
      }),
    );
    assert(fits(PIE));
    assert(
      !fits({
        ...PIE,
        layout: {
          ...PIE.layout,
          rollup: { dim: "admin_area_2", position: "top" },
        },
      }),
    );
    assert(fits({
      ...TABLE,
      layout: {
        ...TABLE.layout,
        rollup: { dim: "admin_area_2", position: "top" },
      },
    }));
  });
  await t.step("a filter with no value", () => {
    assert(
      !fits({ ...TABLE, data: { filters: [{ dim: "year", values: [] }] } }),
    );
    assert(
      fits({ ...TABLE, data: { filters: [{ dim: "year", values: [2023] }] } }),
    );
  });
  await t.step("a value props list with none", () => {
    assert(!fits({ ...TABLE, data: { filters: [], valueProps: [] } }));
    assert(fits({ ...TABLE, data: { filters: [], valueProps: ["a"] } }));
  });
  await t.step("an unknown key, at every level", () => {
    assert(!fits({ ...TABLE, extra: true }));
    assert(!fits({ ...TABLE, data: { filters: [], extra: true } }));
    assert(!fits({ ...TABLE, layout: { ...TABLE.layout, extra: true } }));
    assert(!fits({ ...TABLE, style: { ...TABLE.style, extra: true } }));
    assert(!fits({ ...TABLE, text: { ...TEXT, extra: "" } }));
  });
  await t.step("the period filters the query engine resolves", () => {
    const withFilter = (periodFilter: unknown) => ({
      ...TIMESERIES,
      data: { filters: [], periodFilter },
    });
    assert(fits(withFilter({ type: "last", n: 12, unit: "month" })));
    assert(!fits(withFilter({ type: "last", n: 25, unit: "month" })));
    assert(!fits(withFilter({ type: "last", n: 2, unit: "year" })));
    assert(fits(withFilter({ type: "lastFull", n: 20, unit: "quarter" })));
    assert(!fits(withFilter({ type: "lastFull", n: 21, unit: "quarter" })));
    assert(fits(withFilter({ type: "lastFull", n: 10, unit: "year" })));
    assert(!fits(withFilter({ type: "lastFull", n: 11, unit: "year" })));
  });
  await t.step("colours", () => {
    const withColors = (seriesColors: unknown) => ({
      ...TIMESERIES,
      style: { ...TIMESERIES.style, seriesColors },
    });
    assert(fits(withColors({ custom: ["#aabbcc"] })));
    assert(!fits(withColors({ custom: [] })));
    assert(!fits(withColors({ custom: ["red"] })));
  });
});

Deno.test("the refinements", async (t) => {
  await t.step("a dimension on two slots", () => {
    assertEquals(
      problemsOf({ ...TABLE, layout: { row: "year", col: "year" } }),
      [
        { kind: "onTwoPlaces", holds: "year", places: ["row", "col"] },
      ],
    );
    assert(!fits({ ...TABLE, layout: { row: "year", col: "year" } }));
  });
  await t.step("a dimension on a slot and as the replicant", () => {
    const config: FigureConfig = {
      ...TABLE,
      layout: { ...TABLE.layout, replicant: { dim: "admin_area_2" } },
    };
    assertEquals(problemsOf(config), [
      {
        kind: "onTwoPlaces",
        holds: "admin_area_2",
        places: ["row", "replicant"],
      },
    ]);
    assertEquals(
      problemsOf({
        ...TABLE,
        layout: { ...TABLE.layout, replicant: { dim: "year" } },
      }),
      [],
    );
  });
  await t.step("the value props on two slots", () => {
    assertEquals(
      problemsOf({
        ...TABLE,
        layout: { row: "valueProps", col: "valueProps" },
      }),
      [{ kind: "onTwoPlaces", holds: "valueProps", places: ["row", "col"] }],
    );
  });
  await t.step("a roll-up whose dimension is on no slot", () => {
    assertEquals(
      problemsOf({
        ...TABLE,
        layout: {
          ...TABLE.layout,
          rollup: { dim: "admin_area_3", position: "top" },
        },
      }),
      [{ kind: "rollupOffLayout", dim: "admin_area_3" }],
    );
  });
  await t.step("two filters on one dimension", () => {
    const filters = [
      { dim: "year" as const, values: [2022] },
      { dim: "year" as const, values: [2023] },
    ];
    assertEquals(problemsOf({ ...TABLE, data: { filters } }), [
      { kind: "twoFilters", dim: "year" },
    ]);
  });
  await t.step("a range that is not two ordered periods of one grain", () => {
    const withRange = (min: number, max: number): FigureConfig => ({
      ...TIMESERIES,
      data: { filters: [], periodFilter: { type: "range", min, max } },
    });
    assertEquals(problemsOf(withRange(202301, 202312)), []);
    assertEquals(problemsOf(withRange(2023, 2023)), []);
    assertEquals(problemsOf(withRange(202312, 202301)), [{
      kind: "periodRange",
    }]);
    assertEquals(problemsOf(withRange(2023, 202312)), [{
      kind: "periodRange",
    }]);
    assertEquals(problemsOf(withRange(7, 9)), [{ kind: "periodRange" }]);
    assertEquals(
      problemsOf({
        ...TIMESERIES,
        data: { filters: [], periodFilter: { type: "from", min: 7 } },
      }),
      [{ kind: "periodRange" }],
    );
  });
  const withCf = (
    conditionalFormatting: Extract<
      FigureConfig,
      { type: "table" }
    >["style"]["conditionalFormatting"],
  ): FigureConfig => ({
    ...TABLE,
    style: { ...TABLE.style, conditionalFormatting },
  });
  const bucket = { color: "#ff0000" };
  await t.step(
    "thresholds with other than one more bucket than cutoffs",
    () => {
      const thresholds = (cutoffs: number[], n: number) =>
        withCf({
          type: "thresholds",
          cutoffs,
          buckets: Array.from({ length: n }, () => bucket),
          direction: "higher-is-better",
        });
      assertEquals(problemsOf(thresholds([0.5, 0.8], 3)), []);
      assertEquals(problemsOf(thresholds([0.5, 0.8], 2)), [
        { kind: "thresholdsBuckets" },
      ]);
    },
  );
  await t.step("cutoffs that descend", () => {
    const thresholds = (cutoffs: number[]) =>
      withCf({
        type: "thresholds",
        cutoffs,
        buckets: [bucket, bucket, bucket],
        direction: "lower-is-better",
      });
    assertEquals(problemsOf(thresholds([0.5, 0.5])), []);
    assertEquals(problemsOf(thresholds([0.8, 0.5])), [
      { kind: "thresholdsDescend" },
    ]);
  });
  await t.step(
    "a fixed scale domain whose minimum is not below its maximum",
    () => {
      const scale = (min: number, max: number) =>
        withCf({
          type: "scale",
          palette: { preset: "blues" },
          reverse: false,
          domain: { min, max },
        });
      assertEquals(problemsOf(scale(0, 1)), []);
      assertEquals(problemsOf(scale(1, 1)), [{ kind: "scaleDomain" }]);
    },
  );
  await t.step("a refinement is a parse issue carrying its problem", () => {
    const parsed = figureConfigSchema.safeParse({
      ...TABLE,
      layout: { row: "year", col: "year" },
    });
    assert(!parsed.success);
    const issue = parsed.error.issues[0];
    assert(issue.code === "custom");
    assertEquals(issue.params, {
      kind: "onTwoPlaces",
      holds: "year",
      places: ["row", "col"],
    });
  });
});

Deno.test("the preset instance holds translated texts", () => {
  const translated = {
    title: { en: "Title", fr: "Titre" },
    subtitle: { en: "", fr: "" },
    footnote: { en: "", fr: "", pt: "" },
  };
  assert(
    figureConfigPresetSchema.safeParse({ ...TABLE, text: translated }).success,
  );
  assert(!figureConfigPresetSchema.safeParse(TABLE).success);
  assert(!fits({ ...TABLE, text: translated }));
});

// Every object of a JSON Schema refuses a key it does not name.
function openObjects(schema: unknown, path: string): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((s, i) => openObjects(s, `${path}[${i}]`));
  }
  if (schema === null || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  const own = record.type === "object" && record.additionalProperties !== false
    ? [path]
    : [];
  return [
    ...own,
    ...Object.entries(record).flatMap(([k, v]) =>
      openObjects(v, `${path}.${k}`)
    ),
  ];
}

Deno.test("the JSON Schema is closed at every level", () => {
  const schema = z.toJSONSchema(figureConfigShapeSchema);
  assertEquals(openObjects(schema, "$"), []);
});
