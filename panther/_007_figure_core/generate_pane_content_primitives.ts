// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getScaleAxisValueRange } from "./_axes/measure_y_axis.ts";
import { getXAxisRenderConfig } from "./_axes/axis_rendering_config.ts";
import {
  calculateXAxisGridLines,
  calculateYAxisGridLines,
} from "./_axes/grid_lines.ts";
import {
  generateXPeriodAxisPrimitive,
  generateXTextAxisPrimitive,
  generateYScaleAxisPrimitive,
} from "./_axes/generate_axis_primitives.ts";
import { generateContentPrimitives } from "./_content/generate_content_primitives.ts";
import type { Primitive, RenderContext } from "./deps.ts";
import { RectCoordsDims, Z_INDEX } from "./deps.ts";
import type { MeasurePaneConfig } from "./measure_types.ts";
import type { XTextAxisMeasuredInfo } from "./_axes/x_text/types.ts";
import type { XPeriodAxisMeasuredInfo } from "./_axes/x_period/types.ts";
import type { YScaleAxisWidthInfo } from "./types.ts";
import type { XAxisMeasuredInfo } from "./_axes/measure_x_axis.ts";
import type { YAxisWidthInfo } from "./types.ts";

export function generatePaneContentPrimitives<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
  measured: {
    yAxisWidthInfo: YAxisWidthInfo;
    xAxisMeasuredInfo: XAxisMeasuredInfo;
    yAxisRcd: RectCoordsDims;
    subChartAreaHeight: number;
    subChartAreaWidth: number;
    topHeightForLaneHeaders: number;
  },
): Primitive[] {
  const allPrimitives: Primitive[] = [];
  const i_pane = config.indices.pane;
  const baseStyle = config.baseStyle;
  const xAxisConfig = config.xAxisConfig;
  const yAxisConfig = config.yAxisConfig;
  const tierHeaders = config.dataProps.tierHeaders;
  const laneHeaders = config.dataProps.laneHeaders;

  const xAxisRenderConfig = getXAxisRenderConfig(
    xAxisConfig,
    measured.xAxisMeasuredInfo,
  );

  // Plot area loop (tier × lane)
  const generatedYAxes = new Set<string>();
  const generatedXAxes = new Set<string>();
  const chartData = config.data as TData & {
    values: (number | undefined)[][][][][];
    bounds?: {
      ub: (number | undefined)[][][][][];
      lb: (number | undefined)[][][][][];
    };
  };
  let currentPlotAreaY = measured.yAxisRcd.y() + baseStyle.tiers.paddingTop;

  for (let i_tier = 0; i_tier < tierHeaders.length; i_tier++) {
    let currentPlotAreaX = measured.yAxisRcd.rightX() +
      baseStyle.lanes.paddingLeft;

    for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
      const rcd = new RectCoordsDims({
        x: currentPlotAreaX,
        y: currentPlotAreaY,
        w: measured.subChartAreaWidth,
        h: measured.subChartAreaHeight,
      });
      const seriesVals = chartData.values[i_pane][i_tier][i_lane];

      // Grid lines
      const horizontalGridLines = calculateYAxisGridLines(
        i_tier,
        rcd.y(),
        measured.subChartAreaHeight,
        yAxisConfig,
        measured.yAxisWidthInfo,
      );
      const verticalGridLines = calculateXAxisGridLines(
        i_lane,
        rcd,
        xAxisConfig,
        measured.xAxisMeasuredInfo,
        baseStyle.grid.gridStrokeWidth,
      );

      // Grid primitive
      allPrimitives.push({
        type: "chart-grid",
        key: `grid-${i_pane}-${i_tier}-${i_lane}`,
        bounds: rcd,
        zIndex: Z_INDEX.GRID,
        meta: { paneIndex: i_pane, tierIndex: i_tier, laneIndex: i_lane },
        plotAreaRcd: rcd,
        horizontalLines: horizontalGridLines,
        verticalLines: verticalGridLines,
        style: {
          show: baseStyle.grid.showGrid,
          strokeColor: baseStyle.grid.gridColor,
          strokeWidth: baseStyle.grid.gridStrokeWidth,
          backgroundColor: baseStyle.grid.backgroundColor,
        },
      });

      // Y-axis primitive
      const yAxisKey = `${i_pane}-${i_tier}`;
      if (!generatedYAxes.has(yAxisKey)) {
        switch (yAxisConfig.type) {
          case "scale": {
            allPrimitives.push(
              generateYScaleAxisPrimitive(
                rc,
                i_pane,
                i_tier,
                measured.yAxisWidthInfo as YScaleAxisWidthInfo,
                measured.yAxisRcd,
                rcd.y(),
                measured.subChartAreaHeight,
                yAxisConfig.axisData,
                yAxisConfig.axisStyle,
                baseStyle.grid,
              ),
            );
            generatedYAxes.add(yAxisKey);
            break;
          }
          case "text":
            throw new Error(
              "Y-text axis primitive generation not implemented yet",
            );
        }
      }

      // X-axis primitive
      const xAxisKey = `${i_pane}-${i_lane}`;
      if (!generatedXAxes.has(xAxisKey) && i_tier === 0) {
        switch (xAxisConfig.type) {
          case "text": {
            allPrimitives.push(
              generateXTextAxisPrimitive(
                rc,
                i_pane,
                i_lane,
                rcd.x(),
                measured.xAxisMeasuredInfo as XTextAxisMeasuredInfo,
                xAxisConfig.indicatorHeaders,
                xAxisConfig.axisStyle,
                baseStyle.grid,
              ),
            );
            generatedXAxes.add(xAxisKey);
            break;
          }
          case "period": {
            allPrimitives.push(
              generateXPeriodAxisPrimitive(
                rc,
                i_pane,
                i_lane,
                rcd.x(),
                measured.xAxisMeasuredInfo as XPeriodAxisMeasuredInfo,
                xAxisConfig.nTimePoints,
                xAxisConfig.timeMin,
                xAxisConfig.periodType,
                xAxisConfig.axisStyle,
                baseStyle.grid,
              ),
            );
            generatedXAxes.add(xAxisKey);
            break;
          }
        }
      }

      // Content primitives
      const valueRange = getScaleAxisValueRange(
        measured.yAxisWidthInfo,
        i_tier,
      );
      allPrimitives.push(
        ...generateContentPrimitives({
          rc,
          subChartRcd: rcd,
          subChartInfo: {
            nSerieses: config.dataProps.seriesHeaders.length,
            seriesValArrays: seriesVals,
            i_pane,
            nPanes: config.dataProps.paneHeaders.length,
            i_tier,
            nTiers: tierHeaders.length,
            i_lane,
            nLanes: laneHeaders.length,
          },
          seriesVals,
          valueRange,
          isCentered: xAxisRenderConfig.isCentered,
          incrementWidth: xAxisRenderConfig.incrementWidth,
          gridStrokeWidth: baseStyle.grid.gridStrokeWidth,
          nVals: xAxisRenderConfig.nVals,
          orientation: config.orientation,
          transformedData: { seriesHeaders: config.dataProps.seriesHeaders },
          contentStyle: baseStyle.content,
          dataLabelsTextStyle: baseStyle.text.dataLabels,
          boundsUbSeriesVals: chartData.bounds?.ub[i_pane][i_tier][i_lane],
          boundsLbSeriesVals: chartData.bounds?.lb[i_pane][i_tier][i_lane],
        }),
      );

      currentPlotAreaX += measured.subChartAreaWidth + baseStyle.lanes.gapX;
    }

    currentPlotAreaY += measured.subChartAreaHeight + baseStyle.tiers.gapY;
  }

  return allPrimitives;
}
