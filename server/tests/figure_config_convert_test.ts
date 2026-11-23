// The conversion of a stored `{ d, s, t }` into the figure config: a case for
// every rule of what becomes of a stored config, each with the note a sweep
// counts it by.
//
//   deno test -A server/tests/figure_config_convert_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  type ConversionContext,
  convertFigureConfig,
  convertStoredConfig,
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  type DisaggregationOption,
  type FigureConfig,
  figureConfigSchema,
  groupedDims,
  type PresentationObjectConfig,
} from "lib";

type D = PresentationObjectConfig["d"];
type S = PresentationObjectConfig["s"];

function stored(d: Partial<D>, s: Partial<S> = {}): PresentationObjectConfig {
  return {
    d: {
      type: "table",
      valuesDisDisplayOpt: "col",
      disaggregateBy: [],
      filterBy: [],
      ...d,
    },
    s: { ...DEFAULT_S_CONFIG, ...s },
    t: { ...DEFAULT_T_CONFIG, caption: "Caption", footnote: "Note" },
  };
}

const TWO_VALUES: ConversionContext = {
  valueProps: ["a", "b"],
  canRollUp: true,
  singleValueDims: new Set(),
  yearly: false,
};
const ONE_VALUE: ConversionContext = { ...TWO_VALUES, valueProps: ["a"] };

function convert(
  config: PresentationObjectConfig,
  context: ConversionContext = TWO_VALUES,
) {
  const result = convertStoredConfig(config, context);
  assert(result.ok, `failed: ${result.ok ? "" : result.failure}`);
  assert(
    figureConfigSchema.safeParse(result.config).success,
    "the converted config fits",
  );
  return result;
}

function layoutOf(config: FigureConfig): Record<string, unknown> {
  return config.layout;
}

Deno.test("texts, filters and value props", () => {
  const { config, notes } = convert(stored({
    valuesFilter: ["b"],
    filterBy: [{ disOpt: "admin_area_2", values: ["x", "y"] }],
    disaggregateBy: [{ disOpt: "indicator_common_id", disDisplayOpt: "row" }],
  }));
  assertEquals(config.text, {
    title: "Caption",
    subtitle: "",
    footnote: "Note",
  });
  assertEquals(config.data, {
    filters: [{ dim: "admin_area_2", values: ["x", "y"] }],
    valueProps: ["b"],
  });
  assertEquals(notes, []);
});

Deno.test("two filters on one dimension become one of the values both hold", () => {
  const { config, notes } = convert(stored({
    filterBy: [
      { disOpt: "admin_area_2", values: ["x", "y"] },
      { disOpt: "admin_area_2", values: ["y", "z"] },
    ],
  }));
  assertEquals(config.data.filters, [{ dim: "admin_area_2", values: ["y"] }]);
  assertEquals(notes, ["twoFiltersMerged"]);
});

Deno.test("the value props keep their stored slot", async (t) => {
  await t.step("two or more shown hold it", () => {
    const { config } = convert(stored({
      valuesDisDisplayOpt: "row",
      disaggregateBy: [{ disOpt: "admin_area_2", disDisplayOpt: "col" }],
    }));
    assertEquals(layoutOf(config), { row: "valueProps", col: "admin_area_2" });
  });
  await t.step("one shown keeps the slot while it is free", () => {
    const { config } = convert(
      stored({ valuesDisDisplayOpt: "row" }),
      ONE_VALUE,
    );
    assertEquals(layoutOf(config), { row: "valueProps" });
  });
  await t.step("one shown gives way to a dimension there", () => {
    const { config, notes } = convert(
      stored({
        valuesDisDisplayOpt: "row",
        disaggregateBy: [{ disOpt: "admin_area_2", disDisplayOpt: "row" }],
      }),
      ONE_VALUE,
    );
    assertEquals(layoutOf(config), { row: "admin_area_2" });
    assertEquals(notes, []);
  });
  await t.step("the shown count is the metric's, not the bundle's", () => {
    const { config } = convert(
      stored({ valuesDisDisplayOpt: "row", valuesFilter: ["a", "b", "z"] }),
      { ...TWO_VALUES, valueProps: ["a", "b", "c"] },
    );
    assertEquals(layoutOf(config), { row: "valueProps" });
  });
  await t.step(
    "two or more on an option the type does not read fall back",
    () => {
      const { config, notes } = convert(stored({
        type: "timeseries",
        timeseriesGrouping: "period_id",
        valuesDisDisplayOpt: "indicator",
      }));
      assertEquals(layoutOf(config), {
        period: "period_id",
        series: "valueProps",
      });
      assertEquals(notes, ["valuePropsOnFallbackSlot"]);
    },
  );
});

Deno.test("today's display options take the slot today's renderer reads", () => {
  const { config } = convert(stored({
    type: "chart",
    valuesDisDisplayOpt: "indicator",
    disaggregateBy: [
      { disOpt: "admin_area_2", disDisplayOpt: "cell" },
      { disOpt: "facility_type", disDisplayOpt: "rowGroup" },
      { disOpt: "year", disDisplayOpt: "col" },
    ],
  }));
  assertEquals(layoutOf(config), {
    indicator: "valueProps",
    pane: "admin_area_2",
    tier: "facility_type",
    lane: "year",
  });
});

Deno.test("two things on one slot, one of them not drawn", async (t) => {
  await t.step(
    "filtered to one value, it leaves the slot and stays grouped",
    () => {
      const { config, notes } = convert(stored({
        disaggregateBy: [
          { disOpt: "admin_area_2", disDisplayOpt: "row" },
          { disOpt: "indicator_common_id", disDisplayOpt: "row" },
        ],
        filterBy: [{ disOpt: "indicator_common_id", values: ["anc1"] }],
      }));
      assertEquals(layoutOf(config), {
        row: "admin_area_2",
        col: "valueProps",
      });
      assert(groupedDims(config).includes("indicator_common_id"));
      assertEquals(notes, ["sharedSlotFilteredLeft"]);
    },
  );
  await t.step(
    "holding one member in the rows, it moves to the first free slot",
    () => {
      const { config, notes } = convert(
        stored({
          disaggregateBy: [
            { disOpt: "admin_area_2", disDisplayOpt: "row" },
            { disOpt: "indicator_common_id", disDisplayOpt: "row" },
          ],
        }),
        {
          ...TWO_VALUES,
          singleValueDims: new Set<DisaggregationOption>(["admin_area_2"]),
        },
      );
      assertEquals(layoutOf(config), {
        row: "indicator_common_id",
        col: "valueProps",
        rowGroup: "admin_area_2",
      });
      assertEquals(notes, ["sharedSlotOneMemberMoved"]);
    },
  );
});

Deno.test("two drawn dimensions on one slot: the second moves to the first free slot", () => {
  const { config, notes } = convert(stored({
    disaggregateBy: [
      { disOpt: "admin_area_2", disDisplayOpt: "row" },
      { disOpt: "indicator_common_id", disDisplayOpt: "row" },
    ],
  }));
  assertEquals(layoutOf(config), {
    row: "admin_area_2",
    col: "valueProps",
    rowGroup: "indicator_common_id",
  });
  assertEquals(notes, ["sharedSlotEffectiveMoved"]);
});

Deno.test("a timeseries whose time-axis dimension is also on a slot loses the slot entry", () => {
  const { config, notes } = convert(stored({
    type: "timeseries",
    timeseriesGrouping: "period_id",
    valuesDisDisplayOpt: "series",
    disaggregateBy: [{ disOpt: "period_id", disDisplayOpt: "cell" }],
  }));
  assertEquals(layoutOf(config), { period: "period_id", series: "valueProps" });
  assertEquals(notes, ["timeAxisDimOffSlot"]);
});

Deno.test("the period filter", async (t) => {
  const withFilter = (
    periodFilter: D["periodFilter"],
    yearly: boolean,
  ) => convert(stored({ periodFilter }), { ...TWO_VALUES, yearly });
  await t.step("each of today's filters in panther's shapes", () => {
    const cases: [D["periodFilter"], unknown][] = [
      [{ filterType: "custom", min: 202001, max: 202012 }, {
        type: "range",
        min: 202001,
        max: 202012,
      }],
      [{ filterType: "last_n_months", nMonths: 6 }, {
        type: "last",
        n: 6,
        unit: "month",
      }],
      [{ filterType: "last_calendar_year" }, {
        type: "lastFull",
        n: 1,
        unit: "year",
      }],
      [{ filterType: "last_n_calendar_years", nYears: 3 }, {
        type: "lastFull",
        n: 3,
        unit: "year",
      }],
      [{ filterType: "last_calendar_quarter" }, {
        type: "lastFull",
        n: 1,
        unit: "quarter",
      }],
      [{ filterType: "last_n_calendar_quarters", nQuarters: 4 }, {
        type: "lastFull",
        n: 4,
        unit: "quarter",
      }],
    ];
    for (const [periodFilter, expected] of cases) {
      const { config, notes } = withFilter(periodFilter, false);
      assertEquals(config.data.periodFilter, expected);
      assertEquals(notes, []);
    }
  });
  await t.step("a from_month filter's max is dropped", () => {
    const { config, notes } = withFilter(
      { filterType: "from_month", min: 202001, max: 202312 },
      false,
    );
    assertEquals(config.data.periodFilter, { type: "from", min: 202001 });
    assertEquals(notes, ["fromMaxDropped"]);
  });
  await t.step(
    "a relative filter on yearly data becomes the last full year",
    () => {
      const { config, notes } = withFilter(
        { filterType: "last_n_months", nMonths: 12 },
        true,
      );
      assertEquals(config.data.periodFilter, {
        type: "lastFull",
        n: 1,
        unit: "year",
      });
      assertEquals(notes, ["yearlyRelativePeriodFilter"]);
      assertEquals(
        withFilter({ filterType: "custom", min: 2019, max: 2021 }, true).config
          .data.periodFilter,
        { type: "range", min: 2019, max: 2021 },
      );
    },
  );
});

Deno.test("the roll-up", async (t) => {
  await t.step("open", () => {
    const { config } = convert(stored({
      disaggregateBy: [{
        disOpt: "admin_area_2",
        disDisplayOpt: "row",
        rollup: true,
        rollupPosition: "top",
      }],
    }));
    assertEquals(layoutOf(config).rollup, {
      dim: "admin_area_2",
      position: "top",
    });
  });
  await t.step(
    "closed by a filter of one value, kept while its dimension holds a slot",
    () => {
      const { config } = convert(stored({
        disaggregateBy: [{
          disOpt: "admin_area_2",
          disDisplayOpt: "row",
          rollup: true,
        }],
        filterBy: [{ disOpt: "admin_area_2", values: ["x"] }],
      }));
      assertEquals(layoutOf(config).rollup, {
        dim: "admin_area_2",
        position: "bottom",
      });
    },
  );
  await t.step("closed, with its dimension off its slot, is dropped", () => {
    const { config, notes } = convert(stored({
      disaggregateBy: [
        { disOpt: "indicator_common_id", disDisplayOpt: "row" },
        { disOpt: "admin_area_2", disDisplayOpt: "row", rollup: true },
      ],
      filterBy: [{ disOpt: "admin_area_2", values: ["x"] }],
    }));
    assertEquals(layoutOf(config).rollup, undefined);
    assertEquals(notes, ["sharedSlotFilteredLeft", "closedRollupDropped"]);
  });
  await t.step(
    "on a metric whose values cannot be re-totalled, is dropped",
    () => {
      const { config, notes } = convert(
        stored({
          disaggregateBy: [{
            disOpt: "admin_area_2",
            disDisplayOpt: "row",
            rollup: true,
          }],
        }),
        { ...TWO_VALUES, canRollUp: false },
      );
      assertEquals(layoutOf(config).rollup, undefined);
      assertEquals(notes, ["ineligibleRollupDropped"]);
    },
  );
});

Deno.test("a map", async (t) => {
  const map = (d: Partial<D>) =>
    stored({
      type: "map",
      valuesDisDisplayOpt: "cell",
      disaggregateBy: [{ disOpt: "admin_area_2", disDisplayOpt: "mapArea" }],
      ...d,
    });
  await t.step("that shows several value props names the first", () => {
    const { config, notes } = convert(map({}));
    assertEquals(config.data.valueProps, ["a"]);
    assertEquals(layoutOf(config), { mapArea: "admin_area_2" });
    assertEquals(notes, ["mapFirstValueProp"]);
  });
  await t.step("with no admin-level area fails", () => {
    for (
      const disaggregateBy of [
        [],
        [{
          disOpt: "facility_type" as const,
          disDisplayOpt: "mapArea" as const,
        }],
      ]
    ) {
      const result = convertStoredConfig(map({ disaggregateBy }), ONE_VALUE);
      assert(!result.ok);
      assertEquals(result.failure, "mapWithoutArea");
    }
  });
});

Deno.test("dropped, with no reader", async (t) => {
  await t.step("a time grouping off a timeseries", () => {
    const { notes } = convert(stored({ timeseriesGrouping: "period_id" }));
    assertEquals(notes, ["timeseriesGroupingDropped"]);
  });
  await t.step("a replicant value with no replicant", () => {
    const { config, notes } = convert(stored({ selectedReplicantValue: "x" }));
    assertEquals(layoutOf(config).replicant, undefined);
    assertEquals(notes, ["replicantValueDropped"]);
  });
  await t.step("a style field of another type", () => {
    const { config } = convert(stored({}, {
      mapProjection: "mercator",
      barsStacked: true,
      formatAdminArea3Labels: true,
    }));
    assertEquals(Object.keys(config.style).sort(), [
      "allowVerticalColHeaders",
      "conditionalFormatting",
      "decimalPlaces",
      "hideLegend",
      "memberOrder",
      "showSampleSizes",
    ]);
  });
});

Deno.test("the replicant", () => {
  const { config } = convert(stored({
    disaggregateBy: [
      { disOpt: "admin_area_2", disDisplayOpt: "replicant" },
      { disOpt: "indicator_common_id", disDisplayOpt: "row" },
    ],
    selectedReplicantValue: "",
  }));
  assertEquals(layoutOf(config).replicant, { dim: "admin_area_2" });
});

Deno.test("the style", async (t) => {
  await t.step(
    "lines with points: two label flags become one, on if either was",
    () => {
      const { config, notes } = convert(
        stored({ type: "chart", valuesDisDisplayOpt: "indicator" }, {
          content: "lines-points",
          showDataLabels: false,
          showDataLabelsLineCharts: true,
        }),
      );
      assert(config.type === "chart");
      assertEquals(config.style.showDataLabels, true);
      assertEquals(notes, ["linesPointsLabelsMerged"]);
    },
  );
  await t.step("the special flags, in today's order", () => {
    const { config } = convert(stored({
      type: "timeseries",
      timeseriesGrouping: "period_id",
      valuesDisDisplayOpt: "series",
    }, { specialBarChart: true, specialDisruptionsChart: true }));
    assert(config.type === "timeseries");
    assertEquals(config.style.mode, "percentChange");
  });
  await t.step("a custom colour scale", () => {
    const { config } = convert(
      stored({ type: "chart", valuesDisDisplayOpt: "indicator" }, {
        colorScale: "custom",
        customSeriesStyles: [{
          color: "#112233",
          strokeWidth: 2,
          lineStyle: "dashed",
        }],
        seriesColorFuncPropToUse: "cell",
      }),
    );
    assert(config.type === "chart");
    assertEquals(config.style.seriesColors, { custom: ["#112233"] });
    assertEquals(config.style.colorBy, "pane");
  });
  await t.step("conditional formatting", () => {
    const { config } = convert(stored({}, {
      cfMode: "thresholds",
      cfThresholdCutoffs: [0.5, 0.8],
      cfThresholdBuckets: [
        { color: "#ff0000" },
        { color: { key: "warning" }, label: "Mid" },
        { color: "#00ff00" },
      ],
      cfThresholdDirection: "lower-is-better",
    }));
    assert(config.type === "table");
    assertEquals(config.style.conditionalFormatting, {
      type: "thresholds",
      cutoffs: [0.5, 0.8],
      buckets: [
        { color: "#ff0000" },
        { color: { key: "warning" }, label: "Mid" },
        { color: "#00ff00" },
      ],
      direction: "lower-is-better",
      noDataColor: "#ffffff",
    });
  });
});

Deno.test("a preset's translated texts convert the same way", () => {
  const preset = stored({
    disaggregateBy: [{ disOpt: "admin_area_2", disDisplayOpt: "row" }],
  });
  const text = {
    title: { en: "T", fr: "T" },
    subtitle: { en: "", fr: "" },
    footnote: { en: "", fr: "" },
  };
  const result = convertFigureConfig(preset, text, TWO_VALUES);
  assert(result.ok);
  assertEquals(result.config.text, text);
  assertEquals(result.config.layout, convert(preset).config.layout);
});
