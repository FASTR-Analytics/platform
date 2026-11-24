// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateValueAndValueGridLines,
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
import type { ValueAxisMapping } from "./_content/calculate_mapped_coordinates.ts";
import { generateContentPrimitives } from "./_content/generate_content_primitives.ts";
import { generateReferenceLinePrimitives } from "./_content/generate_reference_line_primitives.ts";
import {
  generateScatterPrimitives,
  scatterValueAxisMappings,
} from "./_content/generate_scatter_primitives.ts";
import { generateSubChartTextPrimitives } from "./_content/generate_sub_chart_text_primitives.ts";
import type {
  ChartGridPrimitive,
  Primitive,
  RectCoordsDims,
  RenderContext,
} from "./deps.ts";
import { buildItem, getDimensionMembers, Z_INDEX } from "./deps.ts";
import type { ChartItemDataDimensions } from "./chart_items.ts";
import {
  subChartItemCoordinates,
  type SubChartMembers,
} from "./sub_chart_members.ts";
import type { MeasuredAxes, MeasurePaneConfig } from "./measure_types.ts";
import { chartValueTensors, type SubChart } from "./sub_charts.ts";
import type { ReferenceLine, ValueRange } from "./types.ts";

export function generatePaneContentPrimitives<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
  measured: {
    axes: MeasuredAxes;
    yAxisRcd: RectCoordsDims;
    secondYAxisRcd?: RectCoordsDims;
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

  const membersOf = (subChart: SubChart): SubChartMembers => ({
    paneMember: paneMembers[i_pane],
    tierMember: tierMembers[subChart.i_tier],
    laneMember: laneMembers[subChart.i_lane],
  });

  const gridPrimitive = (
    subChart: SubChart,
    horizontalLines: ChartGridPrimitive["horizontalLines"],
    verticalLines: ChartGridPrimitive["verticalLines"],
  ): ChartGridPrimitive => ({
    type: "chart-grid",
    key: `grid-${i_pane}-${subChart.i_tier}-${subChart.i_lane}`,
    item: buildItem(
      subChartItemCoordinates(itemDataDimensions, membersOf(subChart)),
    ),
    bounds: subChart.rcd,
    zIndex: Z_INDEX.GRID,
    meta: {
      i_pane,
      i_tier: subChart.i_tier,
      i_lane: subChart.i_lane,
      ...membersOf(subChart),
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

  const referenceLinePrimitives = (
    subChart: SubChart,
    onAxes: {
      key: string;
      referenceLines: ReferenceLine[];
      mapping: ValueAxisMapping;
    }[],
  ) =>
    onAxes.flatMap((axis) =>
      generateReferenceLinePrimitives(rc, {
        i_pane,
        i_tier: subChart.i_tier,
        i_lane: subChart.i_lane,
        nPanes: paneMembers.length,
        nTiers: tierMembers.length,
        nLanes: laneMembers.length,
        members: membersOf(subChart),
        itemDataDimensions,
        style: mergedStyle.content.referenceLines,
        dataLabelsTextStyle: mergedStyle.text.dataLabels,
      }, axis)
    );

  for (const subChart of subCharts) {
    if (
      subChart.kind === "value-and-value" && axes.kind === "value-and-value"
    ) {
      const { horizontalLines, verticalLines } =
        calculateValueAndValueGridLines(subChart, axes.x, axes.y);
      allPrimitives.push(
        gridPrimitive(subChart, horizontalLines, verticalLines),
      );
      const yAxisKey = `${i_pane}-${subChart.i_tier}`;
      if (!generatedYAxes.has(yAxisKey)) {
        allPrimitives.push(
          generateYValueAxisPrimitive(
            rc,
            subChart,
            subChart.yValueClearance,
            axes.y,
            measured.yAxisRcd,
            "first",
            mergedStyle.grid,
            itemDataDimensions,
          ),
        );
        generatedYAxes.add(yAxisKey);
      }
      const xAxisKey = `${i_pane}-${subChart.i_lane}`;
      if (!generatedXAxes.has(xAxisKey) && subChart.tierOrdinal === 0) {
        allPrimitives.push(
          generateXValueAxisPrimitive(
            rc,
            subChart,
            subChart.xValueClearance,
            axes.x,
            "first",
            mergedStyle.grid,
            itemDataDimensions,
          ),
        );
        generatedXAxes.add(xAxisKey);
      }
      allPrimitives.push(
        ...generateScatterPrimitives(
          subChart,
          itemDataDimensions,
          mergedStyle.content.scatterPoints.labelCollision,
        ),
      );
      const mappings = scatterValueAxisMappings(subChart);
      allPrimitives.push(
        ...referenceLinePrimitives(subChart, [
          {
            key: "x",
            referenceLines: axes.x.config.referenceLines,
            mapping: mappings.x,
          },
          {
            key: "y",
            referenceLines: axes.y.config.referenceLines,
            mapping: mappings.y,
          },
        ]),
      );
      continue;
    }
    if (
      subChart.kind !== "category-and-value" ||
      axes.kind !== "category-and-value"
    ) {
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
            subChart.valueClearance,
            axes.y,
            measured.yAxisRcd,
            "first",
            mergedStyle.grid,
            itemDataDimensions,
          ),
        );
        if (
          axes.secondY !== undefined && measured.secondYAxisRcd !== undefined
        ) {
          allPrimitives.push(
            generateYValueAxisPrimitive(
              rc,
              subChart,
              subChart.valueClearance,
              axes.secondY,
              measured.secondYAxisRcd,
              "second",
              mergedStyle.grid,
              itemDataDimensions,
            ),
          );
        }
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
            subChart.valueClearance,
            axes.x,
            "first",
            mergedStyle.grid,
            itemDataDimensions,
          ),
        );
        if (axes.secondX !== undefined) {
          allPrimitives.push(
            generateXValueAxisPrimitive(
              rc,
              subChart,
              subChart.valueClearance,
              axes.secondX,
              "second",
              mergedStyle.grid,
              itemDataDimensions,
            ),
          );
        }
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

    const mapping = (valueRange: ValueRange): ValueAxisMapping => ({
      subChartRcd: subChart.rcd,
      valueRange,
      valueClearance: subChart.valueClearance,
      orientation: axes.orientation,
    });
    const firstAxis = axes.orientation === "vertical" ? axes.y : axes.x;
    const secondAxis = axes.orientation === "vertical"
      ? axes.secondY
      : axes.secondX;
    allPrimitives.push(
      ...referenceLinePrimitives(subChart, [
        {
          key: "first",
          referenceLines: firstAxis.config.referenceLines,
          mapping: mapping(subChart.valueRange),
        },
        ...(secondAxis !== undefined &&
            subChart.secondValueRange !== undefined
          ? [{
            key: "second",
            referenceLines: secondAxis.config.referenceLines,
            mapping: mapping(subChart.secondValueRange),
          }]
          : []),
      ]),
    );
  }

  const subChartTexts = config.chart.subChartTexts ?? [];
  for (const subChart of subCharts) {
    allPrimitives.push(
      ...generateSubChartTextPrimitives(rc, {
        i_pane,
        i_tier: subChart.i_tier,
        i_lane: subChart.i_lane,
        rcd: subChart.rcd,
        members: membersOf(subChart),
        itemDataDimensions,
        padding: mergedStyle.content.subChartTexts.padding,
        textStyle: mergedStyle.text.subChartTexts,
      }, subChartTexts),
    );
  }

  return allPrimitives;
}
