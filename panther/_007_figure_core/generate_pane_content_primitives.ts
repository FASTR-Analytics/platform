// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateXAxisGridLines,
  calculateYAxisGridLines,
} from "./_axes/grid_lines.ts";
import {
  generateXPeriodAxisPrimitive,
  generateXTextAxisPrimitive,
  generateXValueAxisPrimitive,
  generateYTextAxisPrimitive,
  generateYValueAxisPrimitive,
} from "./_axes/generate_axis_primitives.ts";
import { generateContentPrimitives } from "./_content/generate_content_primitives.ts";
import type {
  ChartGridPrimitive,
  Primitive,
  RectCoordsDims,
  RenderContext,
} from "./deps.ts";
import { buildItem, getDimensionMembers, Z_INDEX } from "./deps.ts";
import type { ChartItemDataDimensions } from "./chart_items.ts";
import { subChartItemCoordinates } from "./sub_chart_members.ts";
import type { MeasuredAxes, MeasurePaneConfig } from "./measure_types.ts";
import { chartValueTensors, type SubChart } from "./sub_charts.ts";

export function generatePaneContentPrimitives<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
  measured: {
    axes: MeasuredAxes;
    yAxisRcd: RectCoordsDims;
  },
  subCharts: SubChart[],
  itemDataDimensions: ChartItemDataDimensions,
): Primitive[] {
  const allPrimitives: Primitive[] = [];
  const i_pane = config.i_pane;
  const { mergedStyle, dataDimensions } = config.chart;
  const axes = measured.axes;
  const tierMembers = getDimensionMembers(dataDimensions.tier);
  const laneMembers = getDimensionMembers(dataDimensions.lane);
  const paneMembers = getDimensionMembers(dataDimensions.pane);
  const generatedYAxes = new Set<string>();
  const generatedXAxes = new Set<string>();
  const chartData = chartValueTensors(config);

  const gridPrimitive = (
    subChart: SubChart,
    horizontalLines: ChartGridPrimitive["horizontalLines"],
    verticalLines: ChartGridPrimitive["verticalLines"],
  ): ChartGridPrimitive => ({
    type: "chart-grid",
    key: `grid-${i_pane}-${subChart.i_tier}-${subChart.i_lane}`,
    item: buildItem(
      subChartItemCoordinates(itemDataDimensions, {
        paneMember: paneMembers[i_pane],
        tierMember: tierMembers[subChart.i_tier],
        laneMember: laneMembers[subChart.i_lane],
      }),
    ),
    bounds: subChart.rcd,
    zIndex: Z_INDEX.GRID,
    meta: {
      i_pane,
      i_tier: subChart.i_tier,
      i_lane: subChart.i_lane,
      paneMember: paneMembers[i_pane],
      tierMember: tierMembers[subChart.i_tier],
      laneMember: laneMembers[subChart.i_lane],
    },
    horizontalLines,
    verticalLines,
    style: {
      show: mergedStyle.grid.showGridLines,
      strokeColor: mergedStyle.grid.gridLineColor,
      strokeWidth: mergedStyle.grid.gridLineStrokeWidth,
      backgroundColor: mergedStyle.grid.backgroundColor,
    },
  });

  for (const subChart of subCharts) {
    if (subChart.kind === "none" || axes.kind === "none") {
      allPrimitives.push(gridPrimitive(subChart, [], []));
      continue;
    }
    const { i_tier, i_lane } = subChart;

    allPrimitives.push(
      gridPrimitive(
        subChart,
        calculateYAxisGridLines(
          subChart,
          axes.y,
          mergedStyle.grid.gridLineStrokeWidth,
        ),
        calculateXAxisGridLines(
          subChart,
          axes.x,
          mergedStyle.grid.gridLineStrokeWidth,
        ),
      ),
    );

    // Y-axis primitive — per (pane, tier).
    // For a value axis: one per tier (shared across lanes); guard on
    // generatedYAxes. For text: one per tier drawn only on lane 0 (mirror
    // of X-text in vertical).
    const yAxisKey = `${i_pane}-${i_tier}`;
    if (!generatedYAxes.has(yAxisKey)) {
      if (axes.orientation === "vertical") {
        allPrimitives.push(
          generateYValueAxisPrimitive(
            rc,
            subChart,
            axes.y,
            measured.yAxisRcd,
            mergedStyle.grid,
            itemDataDimensions,
          ),
        );
        generatedYAxes.add(yAxisKey);
      } else if (subChart.laneOrdinal === 0) {
        // First ITERATED lane (mirror of the tierOrdinal === 0 guard).
        allPrimitives.push(
          generateYTextAxisPrimitive(
            rc,
            subChart,
            axes.y,
            measured.yAxisRcd,
            mergedStyle.grid,
            itemDataDimensions,
          ),
        );
        generatedYAxes.add(yAxisKey);
      }
    }

    // X-axis primitive — per (pane, lane).
    // For text/period: drawn once per lane on the first iterated tier (at
    // the bottom of the pane). For a value axis: same; range varies per
    // lane. First ITERATED tier, not global tier 0 — under unbalanced
    // tier membership a pane's first visible tier may have a global
    // index > 0.
    const xAxisKey = `${i_pane}-${i_lane}`;
    if (!generatedXAxes.has(xAxisKey) && subChart.tierOrdinal === 0) {
      if (axes.orientation === "horizontal") {
        allPrimitives.push(
          generateXValueAxisPrimitive(
            rc,
            subChart,
            axes.x,
            mergedStyle.grid,
            itemDataDimensions,
          ),
        );
      } else {
        switch (axes.x.type) {
          case "text":
            allPrimitives.push(
              generateXTextAxisPrimitive(
                rc,
                subChart,
                axes.x,
                mergedStyle.grid,
                itemDataDimensions,
              ),
            );
            break;
          case "period":
            allPrimitives.push(
              generateXPeriodAxisPrimitive(
                rc,
                subChart,
                axes.x,
                mergedStyle.grid,
                itemDataDimensions,
              ),
            );
            break;
        }
      }
      generatedXAxes.add(xAxisKey);
    }

    allPrimitives.push(
      ...generateContentPrimitives(subChart, {
        seriesValues: chartData.values[i_pane][i_tier][i_lane],
        uncertaintyUbSeriesValues: chartData.uncertaintyValues
          ?.ub[i_pane][i_tier][i_lane],
        uncertaintyLbSeriesValues: chartData.uncertaintyValues
          ?.lb[i_pane][i_tier][i_lane],
        orientation: axes.orientation,
        itemDataDimensions,
        contentStyle: mergedStyle.content,
        gridLineStrokeWidth: mergedStyle.grid.gridLineStrokeWidth,
      }),
    );
  }

  return allPrimitives;
}
