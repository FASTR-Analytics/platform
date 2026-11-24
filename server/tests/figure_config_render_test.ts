// Every preset and every config the Explore page derives, converted to the
// figure config, and each changed to every other type its metric draws where
// the result passes the validator, laid out by figureAxes and drawn through
// panther's transforms over made rows, also with each laid-out dimension held
// to one member in the rows: none throws.
//
//   FASTR_MODULES_LOCAL_DIR=<modules repo> deno test -A --env-file server/tests/figure_config_render_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  getChartOHDataTransformed,
  getChartOVDataTransformed,
  getMapDataTransformed,
  getPieDataTransformed,
  getTableDataTransformed,
  getTimeseriesDataTransformed,
} from "@timroberton/panther";
import {
  changeFigureType,
  convertStoredConfig,
  type Dim,
  type FigureAxes,
  figureAxes,
  type FigureConfig,
  figureFetchConfig,
  get_PRESENTATION_SELECT_OPTIONS,
  isRollupEligibleResultsValue,
  type MetricWithStatus,
  type PeriodOption,
  periodOptionToPeriodType,
  shownValueProps,
  validateFigureConfig,
} from "lib";
import { exploreItems, metricsOf, presetItems } from "./_figure_config_sets.ts";
import { loadModuleDefinitions } from "./_module_definitions.ts";

const MODULES_DIR = Deno.env.get("FASTR_MODULES_LOCAL_DIR");

type Row = Record<string, string | number>;

const PERIOD_MEMBERS: Partial<Record<Dim, number[]>> = {
  period_id: [202301, 202302, 202303],
  quarter_id: [20231, 20232, 20233],
  year: [2021, 2022, 2023],
};

function membersOf(config: FigureConfig, dim: Dim): (string | number)[] {
  const filter = config.data.filters.find((f) => f.dim === dim);
  if (filter !== undefined) return filter.values.slice(0, 2);
  const replicant = config.layout.replicant;
  if (replicant?.dim === dim) return [replicant.value ?? "UNSELECTED"];
  return PERIOD_MEMBERS[dim] ?? [`${dim}_a`, `${dim}_b`];
}

// The rows the figure's query would return, every grouped dimension crossed,
// with `held` given one member.
function madeRows(
  config: FigureConfig,
  metric: MetricWithStatus,
  held: Dim | undefined,
): Row[] {
  const fetch = figureFetchConfig(config, metric);
  if (!fetch.success) throw new Error(fetch.err);
  const shown = shownValueProps(config, metric.valueProps);
  let rows: Row[] = [{}];
  for (const dim of fetch.data.groupBys) {
    const all = membersOf(config, dim);
    const members = dim === held ? all.slice(0, 1) : all;
    rows = rows.flatMap((r) => members.map((m) => ({ ...r, [dim]: m })));
  }
  return rows.map((r, i) => {
    const row: Row = { ...r };
    shown.forEach((p, j) => {
      row[p] = ((i * 7 + j * 3) % 10) / 10;
    });
    return row;
  });
}

function oneMemberDims(axes: FigureAxes, rows: readonly Row[]): Set<Dim> {
  const out = new Set<Dim>();
  for (const prop of Object.values(axes)) {
    if (prop === undefined || prop === "--v") continue;
    if (new Set(rows.map((r) => r[prop])).size === 1) out.add(prop);
  }
  return out;
}

function draw(
  config: FigureConfig,
  shown: string[],
  axes: FigureAxes,
  rows: Row[],
): void {
  switch (config.type) {
    case "timeseries": {
      const period = axes.period as PeriodOption;
      const stacked = config.style.mode === "standard" &&
        config.style.marks === "bars" && config.style.stacked;
      getTimeseriesDataTransformed({
        jsonArray: rows,
        jsonDataConfig: {
          valueProps: shown,
          periodProp: period,
          periodType: periodOptionToPeriodType(period),
          seriesProp: axes.series,
          paneProp: axes.pane,
          tierProp: axes.tier,
          laneProp: axes.lane,
        },
      }, stacked);
      return;
    }
    case "chart": {
      const stacked = config.style.marks === "bars" && config.style.stacked;
      const jsonDataConfig = {
        valueProps: shown,
        indicatorProp: axes.indicator as string,
        seriesProp: axes.series,
        paneProp: axes.pane,
        tierProp: axes.tier,
        laneProp: axes.lane,
      };
      if (config.style.orientation === "horizontal") {
        getChartOHDataTransformed({ jsonArray: rows, jsonDataConfig }, stacked);
      } else {
        getChartOVDataTransformed({ jsonArray: rows, jsonDataConfig }, stacked);
      }
      return;
    }
    case "table":
      getTableDataTransformed({
        jsonArray: rows,
        jsonDataConfig: {
          valueProps: shown,
          rowProp: axes.row,
          colProp: axes.col,
          rowGroupProp: axes.rowGroup,
          colGroupProp: axes.colGroup,
        },
      });
      return;
    case "pie":
      getPieDataTransformed({
        jsonArray: rows,
        jsonDataConfig: {
          valueProps: shown,
          seriesProp: axes.series,
          indicatorProp: axes.indicator,
          paneProp: axes.pane,
          tierProp: axes.tier,
          laneProp: axes.lane,
        },
      });
      return;
    case "map": {
      const area = config.layout.mapArea;
      const ids = [...new Set(rows.map((r) => String(r[area])))];
      getMapDataTransformed({
        geoData: {
          type: "FeatureCollection",
          features: ids.map((id, i) => ({
            type: "Feature",
            properties: { area_id: id },
            geometry: {
              type: "Polygon",
              coordinates: [[[i, 0], [i + 1, 0], [i + 1, 1], [i, 1], [i, 0]]],
            },
          })),
        },
        jsonArray: rows,
        jsonDataConfig: {
          valueProp: shown[0],
          mapAreaProp: area,
          mapAreaMatchProp: "area_id",
          paneProp: axes.pane,
          tierProp: axes.tier,
          laneProp: axes.lane,
        },
      });
      return;
    }
  }
}

// Draws the config over its made rows, and again with each laid-out dimension
// held to one member; returns what threw.
function drawEveryWay(
  id: string,
  config: FigureConfig,
  metric: MetricWithStatus,
): { drawn: number; failures: string[] } {
  const shown = shownValueProps(config, metric.valueProps);
  const unheld = figureAxes(config, shown, new Set());
  const baseRows = madeRows(config, metric, undefined);
  const laidOut = Object.values(
    figureAxes(config, shown, oneMemberDims(unheld, baseRows)),
  ).filter((p): p is Dim => p !== undefined && p !== "--v");
  const failures: string[] = [];
  let drawn = 0;
  for (const held of [undefined, ...laidOut]) {
    const rows = held === undefined ? baseRows : madeRows(config, metric, held);
    try {
      draw(
        config,
        shown,
        figureAxes(config, shown, oneMemberDims(unheld, rows)),
        rows,
      );
      drawn++;
    } catch (e) {
      failures.push(
        `${id}${held === undefined ? "" : ` (${held} held)`}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
  return { drawn, failures };
}

Deno.test({
  name:
    "every preset and Explore config, and each changed to every type it passes as, draws",
  ignore: MODULES_DIR === undefined,
  async fn() {
    const definitions = await loadModuleDefinitions(MODULES_DIR ?? "");
    const metrics = metricsOf(definitions);
    const items = [
      ...presetItems(metrics),
      ...exploreItems(definitions, metrics),
    ];
    const failures: string[] = [];
    const drawnByType = new Map<string, number>();
    const run = (
      id: string,
      config: FigureConfig,
      metric: MetricWithStatus,
    ) => {
      const result = drawEveryWay(id, config, metric);
      failures.push(...result.failures);
      drawnByType.set(
        config.type,
        (drawnByType.get(config.type) ?? 0) + result.drawn,
      );
    };
    for (const item of items) {
      const converted = convertStoredConfig(item.config, {
        valueProps: item.metric.valueProps,
        canRollUp: isRollupEligibleResultsValue(item.metric),
        singleValueDims: new Set(),
        yearly:
          item.metric.mostGranularTimePeriodColumnInResultsFile === "year",
      });
      if (!converted.ok) {
        failures.push(`${item.id}: ${converted.failure}`);
        continue;
      }
      run(item.id, converted.config, item.metric);
      for (
        const { value: type } of get_PRESENTATION_SELECT_OPTIONS(
          item.metric.disaggregationOptions,
        )
      ) {
        if (type === converted.config.type) continue;
        const changed = changeFigureType(converted.config, type, item.metric);
        if (validateFigureConfig(changed, item.metric).length > 0) continue;
        run(`${item.id} -> ${type}`, changed, item.metric);
      }
    }
    assertEquals(failures, []);
    for (const type of ["table", "timeseries", "chart", "map", "pie"]) {
      assert((drawnByType.get(type) ?? 0) > 0, `no ${type} drawn`);
    }
  },
});
