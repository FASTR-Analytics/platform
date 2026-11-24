// The change of type: where each dimension goes, what is dropped, added or
// left out, how a timeseries takes its period and a map its area, and that
// every preset and Explore config changed to every type its metric draws
// fits the schema and lays out what today's change of type lays out.

import { assertEquals, assertThrows } from "@std/assert";
import {
  changeFigureType,
  convertStoredConfig,
  convertVisualizationType,
  defaultFigureStyle,
  type FigureConfig,
  figureConfigSchema,
  get_PRESENTATION_SELECT_OPTIONS,
  isRollupEligibleResultsValue,
  type MetricWithStatus,
  type PresentationObjectConfig,
  slotEntries,
  type StartingMetric,
  VALUE_PROPS,
} from "lib";
import { exploreItems, metricsOf, presetItems } from "./_figure_config_sets.ts";
import { loadModuleDefinitions } from "./_module_definitions.ts";

const MODULES_DIR = Deno.env.get("FASTR_MODULES_LOCAL_DIR");

const NONE = { type: "none" } as const;
const TEXT = { title: "T", subtitle: "", footnote: "" };
const DATA = { valueProps: ["a", "b"], filters: [] };

const METRIC: StartingMetric = {
  valueProps: ["a", "b"],
  formatAs: "number",
  disaggregationOptions: [
    { value: "admin_area_2", isRequired: false },
    { value: "admin_area_3", isRequired: false },
    { value: "indicator_common_id", isRequired: true },
    {
      value: "year",
      isRequired: false,
      allowedPresentationOptions: ["table", "chart"],
    },
    {
      value: "facility_type",
      isRequired: false,
      allowedPresentationOptions: ["table"],
    },
    { value: "facility_ownership", isRequired: false },
    { value: "facility_custom_1", isRequired: false },
    { value: "facility_custom_2", isRequired: false },
  ],
  mostGranularTimePeriodColumnInResultsFile: "period_id",
};

function table(
  layout: Extract<FigureConfig, { type: "table" }>["layout"],
): FigureConfig {
  return {
    type: "table",
    data: DATA,
    layout,
    style: defaultFigureStyle("table", NONE),
    text: TEXT,
  };
}

Deno.test("a dimension keeps its slot, or takes today's fallback, or the first free one", () => {
  const next = changeFigureType(
    table({
      row: "admin_area_2",
      col: VALUE_PROPS,
      rowGroup: "indicator_common_id",
    }),
    "chart",
    METRIC,
  );
  assertEquals(next.layout, {
    indicator: VALUE_PROPS,
    tier: "admin_area_2",
    series: "indicator_common_id",
  });
  assertEquals(next.data, DATA);
  assertEquals(next.text, TEXT);
  assertEquals(next.style, defaultFigureStyle("chart", NONE));
});

Deno.test("a dimension the type does not allow is dropped, and a required one added", () => {
  const next = changeFigureType(
    table({ row: "facility_type", col: VALUE_PROPS }),
    "chart",
    METRIC,
  );
  assertEquals(next.layout, {
    indicator: VALUE_PROPS,
    series: "indicator_common_id",
  });
});

Deno.test("a dimension with no free slot and no free replicant is left out", () => {
  const chart: FigureConfig = {
    type: "chart",
    data: DATA,
    layout: {
      indicator: "indicator_common_id",
      series: "admin_area_2",
      pane: "admin_area_3",
      tier: "facility_ownership",
      lane: "facility_custom_1",
      replicant: { dim: "facility_custom_2" },
    },
    style: defaultFigureStyle("chart", NONE),
    text: TEXT,
  };
  const next = changeFigureType(chart, "table", METRIC);
  assertEquals(next.layout, {
    col: VALUE_PROPS,
    row: "indicator_common_id",
    rowGroup: "admin_area_2",
    colGroup: "admin_area_3",
    replicant: { dim: "facility_custom_2" },
  });
});

Deno.test("a timeseries takes the finest period laid out, else the metric's", () => {
  const withYear = changeFigureType(
    table({ row: "indicator_common_id", colGroup: "year" }),
    "timeseries",
    METRIC,
  );
  assertEquals(withYear.layout.period, "year");
  assertEquals(withYear.layout.series, VALUE_PROPS);
  const without = changeFigureType(
    table({ row: "indicator_common_id" }),
    "timeseries",
    METRIC,
  );
  assertEquals(without.layout.period, "period_id");
  assertThrows(() =>
    changeFigureType(table({}), "timeseries", {
      ...METRIC,
      mostGranularTimePeriodColumnInResultsFile: undefined,
    })
  );
});

Deno.test("a map takes the finest admin level laid out, else the replicant's, else the metric's coarsest", () => {
  const finest = changeFigureType(
    table({
      row: "admin_area_2",
      col: "admin_area_3",
      rowGroup: "indicator_common_id",
    }),
    "map",
    METRIC,
  );
  assertEquals(finest.layout.mapArea, "admin_area_3");
  assertEquals(finest.layout.tier, "admin_area_2");
  const replicant = changeFigureType(
    table({
      row: "indicator_common_id",
      replicant: { dim: "admin_area_2", value: "x" },
    }),
    "map",
    METRIC,
  );
  assertEquals(replicant.layout.mapArea, "admin_area_2");
  assertEquals(replicant.layout.replicant, undefined);
  const coarsest = changeFigureType(
    table({ row: "indicator_common_id" }),
    "map",
    METRIC,
  );
  assertEquals(coarsest.layout.mapArea, "admin_area_2");
});

Deno.test("a roll-up stays while its dimension is laid out and the type takes one", () => {
  const withRollup = table({
    row: "admin_area_2",
    col: "indicator_common_id",
    rollup: { dim: "admin_area_2", position: "top" },
  });
  const chart = changeFigureType(withRollup, "chart", METRIC);
  assertEquals(chart.layout.rollup, { dim: "admin_area_2", position: "top" });
  const pie = changeFigureType(withRollup, "pie", METRIC);
  assertEquals("rollup" in pie.layout, false);
});

function converted(metric: MetricWithStatus, stored: PresentationObjectConfig) {
  return convertStoredConfig(stored, {
    valueProps: metric.valueProps,
    canRollUp: isRollupEligibleResultsValue(metric),
    singleValueDims: new Set(),
    yearly: metric.mostGranularTimePeriodColumnInResultsFile === "year",
  });
}

// The dimensions laid out, the slots they take and the replicant. Where two
// dimensions want one slot, today's change of type gives it to the one added
// first and this one to the one on the earlier slot, so which takes which is
// not compared.
function laidOut(config: FigureConfig): string {
  const entries = slotEntries(config).filter((e) =>
    e.holds !== VALUE_PROPS && e.slot !== "period" && e.slot !== "mapArea"
  );
  return JSON.stringify({
    slots: entries.map((e) => e.slot).sort(),
    dims: entries.map((e) => e.holds).sort(),
    replicant: config.layout.replicant?.dim,
  });
}

Deno.test({
  name:
    "every preset and Explore config changes to every type its metric draws",
  ignore: MODULES_DIR === undefined,
  async fn() {
    const definitions = await loadModuleDefinitions(MODULES_DIR ?? "");
    const metrics = metricsOf(definitions);
    const items = [
      ...presetItems(metrics),
      ...exploreItems(definitions, metrics),
    ];
    const failures: string[] = [];
    let pairs = 0;
    for (const item of items) {
      const base = converted(item.metric, item.config);
      if (!base.ok) {
        failures.push(`${item.id}: ${base.failure}`);
        continue;
      }
      for (
        const { value: type } of get_PRESENTATION_SELECT_OPTIONS(
          item.metric.disaggregationOptions,
        )
      ) {
        if (type === base.config.type) continue;
        pairs++;
        const next = changeFigureType(base.config, type, item.metric);
        const fit = figureConfigSchema.safeParse(next);
        if (!fit.success) {
          failures.push(
            `${item.id} -> ${type}: ${fit.error.issues[0]?.message}`,
          );
        }
        const today = converted(
          item.metric,
          convertVisualizationType(
            item.config,
            type,
            item.metric.disaggregationOptions,
          ),
        );
        if (today.ok && laidOut(today.config) !== laidOut(next)) {
          failures.push(
            `${item.id} -> ${type}: today ${laidOut(today.config)}, now ${
              laidOut(next)
            }`,
          );
        }
      }
    }
    assertEquals(failures, []);
    assertEquals(pairs > 1000, true);
  },
});
