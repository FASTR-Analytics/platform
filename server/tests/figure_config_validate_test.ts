// The figure config's metric checks: a passing and a refused case for every
// check that needs the config and its metric, on made metrics.
//
//   deno test -A server/tests/figure_config_validate_test.ts

import { assertEquals } from "@std/assert";
import {
  type FigureConfig,
  type FigureConfigProblem,
  type FigureMetric,
  startingFigureConfig,
  validateFigureConfig,
} from "lib";

const TIME_BASED = ["table", "chart"] as const;

const METRIC: FigureMetric = {
  id: "m-test",
  valueProps: ["a", "b"],
  formatAs: "percent",
  valueFunc: "SUM",
  mostGranularTimePeriodColumnInResultsFile: "period_id",
  disaggregationOptions: [
    { value: "indicator_common_id", isRequired: true },
    { value: "admin_area_2", isRequired: false },
    { value: "admin_area_3", isRequired: false },
    {
      value: "period_id",
      isRequired: false,
      allowedPresentationOptions: [...TIME_BASED],
    },
    {
      value: "year",
      isRequired: false,
      allowedPresentationOptions: [...TIME_BASED],
    },
    { value: "hfa_service_category", isRequired: false },
  ],
};

const YEARLY: FigureMetric = {
  ...METRIC,
  id: "m-yearly",
  mostGranularTimePeriodColumnInResultsFile: "year",
  disaggregationOptions: [
    { value: "admin_area_2", isRequired: false },
    {
      value: "year",
      isRequired: true,
      allowedPresentationOptions: [...TIME_BASED],
    },
  ],
};

const UNTIMED: FigureMetric = {
  ...METRIC,
  id: "m-untimed",
  mostGranularTimePeriodColumnInResultsFile: undefined,
  disaggregationOptions: [{ value: "admin_area_2", isRequired: false }],
};

function problems(
  config: FigureConfig,
  metric = METRIC,
): FigureConfigProblem[] {
  return validateFigureConfig(config, metric);
}

const table = startingFigureConfig(METRIC, "table", ["admin_area_2"]);
const chart = startingFigureConfig(METRIC, "chart", ["admin_area_2"]);
const timeseries = startingFigureConfig(METRIC, "timeseries", []);
const map = startingFigureConfig(METRIC, "map", ["admin_area_2"]);

Deno.test("the starting configs used below pass", () => {
  for (const config of [table, chart, timeseries, map]) {
    assertEquals(problems(config), []);
  }
});

Deno.test("every dimension and value prop named is the metric's", async (t) => {
  await t.step("a value prop", () => {
    assertEquals(
      problems({ ...table, data: { ...table.data, valueProps: ["a", "z"] } }),
      [{ kind: "unknownValueProp", valueProp: "z" }],
    );
  });
  await t.step(
    "a dimension on a slot, filtered, ordered, or the replicant",
    () => {
      assertEquals(
        problems({
          ...table,
          layout: { ...table.layout, rowGroup: "facility_type" },
        }),
        [{ kind: "unknownDim", dim: "facility_type" }],
      );
      assertEquals(
        problems({
          ...table,
          data: { filters: [{ dim: "strat", values: ["x", "y"] }] },
        }),
        [{ kind: "unknownDim", dim: "strat" }],
      );
      assertEquals(
        problems({
          ...table,
          style: {
            ...table.style,
            memberOrder: [{ dim: "level", memberIds: [] }],
          },
        }),
        [{ kind: "unknownDim", dim: "level" }],
      );
      assertEquals(
        problems({
          ...table,
          layout: { ...table.layout, replicant: { dim: "level" } },
        }),
        [{ kind: "unknownDim", dim: "level" }],
      );
    },
  );
});

Deno.test("a filter-only dimension is only filtered", () => {
  assertEquals(
    problems({
      ...table,
      layout: { ...table.layout, rowGroup: "hfa_service_category" },
    }),
    [{ kind: "filterOnlyLaidOut", dim: "hfa_service_category" }],
  );
  assertEquals(
    problems({
      ...table,
      data: { filters: [{ dim: "hfa_service_category", values: ["x"] }] },
    }),
    [],
  );
});

Deno.test("a dimension is laid out only on a type its metric allows", async (t) => {
  await t.step("a period dimension on a map", () => {
    assertEquals(
      problems({ ...map, layout: { ...map.layout, lane: "year" } }),
      [{ kind: "dimNotOnType", dim: "year" }],
    );
    assertEquals(
      problems({ ...table, layout: { ...table.layout, rowGroup: "year" } }),
      [],
    );
  });
  await t.step("a timeseries lays time out on its period only", () => {
    assertEquals(
      problems({
        ...timeseries,
        layout: { ...timeseries.layout, tier: "year" },
      }),
      [{ kind: "dimNotOnType", dim: "year" }],
    );
    assertEquals(
      problems({
        ...timeseries,
        layout: { ...timeseries.layout, period: "year" },
      }),
      [],
    );
  });
});

Deno.test("where the value props are drawn", async (t) => {
  await t.step("two or more are on a slot that names them", () => {
    const { col: _values, ...layout } = table.layout;
    assertEquals(problems({ ...table, layout }), [{
      kind: "valuePropsOnNoSlot",
    }]);
    assertEquals(
      problems({ ...table, layout, data: { filters: [], valueProps: ["a"] } }),
      [],
    );
  });
  await t.step(
    "a chart with them on another slot holds a dimension on indicator",
    () => {
      const { indicator: _i, ...rest } = chart.layout;
      assertEquals(
        problems({ ...chart, layout: { ...rest, lane: "valueProps" } }),
        [{ kind: "chartIndicatorEmpty" }],
      );
      assertEquals(
        problems({
          ...chart,
          layout: { ...rest, indicator: "admin_area_3", lane: "valueProps" },
        }),
        [],
      );
    },
  );
  await t.step("a map shows exactly one", () => {
    const { valueProps: _v, ...data } = map.data;
    assertEquals(problems({ ...map, data }), [{ kind: "mapValueProps" }]);
  });
});

Deno.test("a required dimension is never pooled", async (t) => {
  const { row: _row, ...layout } = table.layout;
  await t.step("off every slot", () => {
    assertEquals(problems({ ...table, layout }), [
      { kind: "requiredPooled", dim: "indicator_common_id" },
    ]);
  });
  await t.step("held as the replicant, or by a filter of one value", () => {
    assertEquals(
      problems({
        ...table,
        layout: { ...layout, replicant: { dim: "indicator_common_id" } },
      }),
      [],
    );
    assertEquals(
      problems({
        ...table,
        layout,
        data: { filters: [{ dim: "indicator_common_id", values: ["anc1"] }] },
      }),
      [],
    );
    assertEquals(
      problems({
        ...table,
        layout,
        data: { filters: [{ dim: "indicator_common_id", values: ["a", "b"] }] },
      }),
      [{ kind: "requiredPooled", dim: "indicator_common_id" }],
    );
  });
  await t.step(
    "a required period dimension, held by one period of the grain",
    () => {
      const yearlyMap = startingFigureConfig(YEARLY, "map", ["admin_area_2"]);
      assertEquals(problems(yearlyMap, YEARLY), []);
      const { periodFilter: _pf, ...pooled } = yearlyMap.data;
      assertEquals(problems({ ...yearlyMap, data: pooled }, YEARLY), [
        { kind: "requiredPooled", dim: "year" },
      ]);
      assertEquals(
        problems({
          ...yearlyMap,
          data: {
            ...pooled,
            periodFilter: { type: "range", min: 2020, max: 2020 },
          },
        }, YEARLY),
        [],
      );
      assertEquals(
        problems({
          ...yearlyMap,
          data: {
            ...pooled,
            periodFilter: { type: "range", min: 2019, max: 2020 },
          },
        }, YEARLY),
        [{ kind: "requiredPooled", dim: "year" }],
      );
    },
  );
});

Deno.test("the period filter the metric's grain takes", async (t) => {
  const yearlyTable = startingFigureConfig(YEARLY, "table", ["admin_area_2"]);
  await t.step(
    "yearly data takes a range of years or the last full year",
    () => {
      for (
        const periodFilter of [
          { type: "range" as const, min: 2019, max: 2021 },
          { type: "lastFull" as const, n: 1, unit: "year" as const },
        ]
      ) {
        assertEquals(
          problems(
            { ...yearlyTable, data: { filters: [], periodFilter } },
            YEARLY,
          ),
          [],
        );
      }
      for (
        const periodFilter of [
          { type: "last" as const, n: 12, unit: "month" as const },
          { type: "lastFull" as const, n: 2, unit: "year" as const },
          { type: "range" as const, min: 201901, max: 202112 },
        ]
      ) {
        assertEquals(
          problems(
            { ...yearlyTable, data: { filters: [], periodFilter } },
            YEARLY,
          ),
          [{ kind: "periodFilterOfYearlyData" }],
        );
      }
    },
  );
  await t.step("a metric with no time column takes none", () => {
    const untimed = startingFigureConfig(UNTIMED, "table", ["admin_area_2"]);
    assertEquals(problems(untimed, UNTIMED), []);
    assertEquals(
      problems({
        ...untimed,
        data: {
          filters: [],
          periodFilter: { type: "lastFull", n: 1, unit: "year" },
        },
      }, UNTIMED),
      [{ kind: "periodFilterWithoutTime" }],
    );
  });
});

Deno.test("a roll-up needs a metric that can be rolled up", () => {
  const rolled: FigureConfig = {
    ...table,
    layout: {
      ...table.layout,
      rollup: { dim: "admin_area_2", position: "top" },
    },
  };
  assertEquals(problems(rolled), []);
  assertEquals(problems(rolled, { ...METRIC, valueFunc: "identity" }), [
    { kind: "rollupNotEligible" },
  ]);
});

Deno.test("the special timeseries modes", async (t) => {
  const BAND: FigureMetric = {
    ...METRIC,
    id: "m11-01-01",
    valueProps: ["observed", "expected", "ppi_lwr", "ppi_upr"],
  };
  const DISRUPTIONS: FigureMetric = {
    ...METRIC,
    id: "m3-02-01",
    valueProps: ["actual", "expected"],
  };
  const withMode = (
    style: Extract<FigureConfig, { type: "timeseries" }>["style"],
  ) => ({
    ...timeseries,
    style,
  });
  const modeStyle = {
    invertColors: false,
    showDataLabels: false,
    decimalPlaces: 0 as const,
    paneColumns: "auto" as const,
    memberOrder: [],
    valueAxisMaxAt100Percent: false,
    valueAxisMinAuto: false,
    valueAxisLimitsPerTierOrLane: true,
  };
  const band = withMode({ mode: "disruptionsBand", ...modeStyle });
  const disruptions = withMode({ mode: "disruptions", ...modeStyle });
  await t.step("a mode needs a metric on its list", () => {
    assertEquals(problems(band, BAND), []);
    assertEquals(problems(band, { ...BAND, id: "m11-02-01" }), [
      { kind: "modeNotOfMetric", mode: "disruptionsBand" },
    ]);
  });
  const { series: _series, ...seriesFree } = band.layout;
  await t.step("never a dimension on series", () => {
    assertEquals(
      problems({
        ...band,
        layout: { ...band.layout, series: "admin_area_2" },
      }, BAND),
      [
        { kind: "valuePropsOnNoSlot" },
        { kind: "modeSeriesDim", mode: "disruptionsBand" },
      ],
    );
  });
  await t.step("the value props on series while two or more are shown", () => {
    assertEquals(
      problems(
        { ...band, layout: { ...seriesFree, tier: "valueProps" } },
        BAND,
      ),
      [{ kind: "modeValuePropsSlot", mode: "disruptionsBand" }],
    );
  });
  await t.step("disruptions shows two or more", () => {
    assertEquals(problems(disruptions, DISRUPTIONS), []);
    assertEquals(
      problems({
        ...disruptions,
        data: { filters: [], valueProps: ["actual"] },
      }, DISRUPTIONS),
      [{ kind: "modeValueProps", mode: "disruptions" }],
    );
  });
  await t.step("the band shows exactly its four", () => {
    assertEquals(
      problems({
        ...band,
        data: { filters: [], valueProps: ["observed", "expected", "ppi_lwr"] },
      }, BAND),
      [{ kind: "modeValueProps", mode: "disruptionsBand" }],
    );
  });
});

Deno.test("indicator colouring needs an indicator-format metric", () => {
  const coloured: FigureConfig = {
    ...table,
    style: { ...table.style, conditionalFormatting: { type: "indicator" } },
  };
  assertEquals(problems(coloured, { ...METRIC, formatAs: "indicator" }), []);
  assertEquals(problems(coloured), [{ kind: "indicatorColoring" }]);
});

Deno.test("a value that does not fit the shape has its shape problems", () => {
  assertEquals(
    validateFigureConfig({
      ...table,
      data: { filters: [{ dim: "admin_area_2", values: [] }] },
    }, METRIC),
    [{ kind: "shape", path: "data.filters.0.values", code: "too_small" }],
  );
});
