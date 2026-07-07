// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  getScaleAxisValueRange,
  getXScaleAxisValueRange,
} from "./_axes/measure_y_axis.ts";
import {
  getXAxisRenderConfig,
  getYAxisRenderConfig,
} from "./_axes/axis_rendering_config.ts";
import {
  calculateXAxisGridLines,
  calculateYAxisGridLines,
} from "./_axes/grid_lines.ts";
import {
  generateXPeriodAxisPrimitive,
  generateXScaleAxisPrimitive,
  generateXTextAxisPrimitive,
  generateYScaleAxisPrimitive,
  generateYTextAxisPrimitive,
} from "./_axes/generate_axis_primitives.ts";
import { generateContentPrimitives } from "./_content/generate_content_primitives.ts";
import { measureDataLabelEndClearance } from "./_content/measure_data_label_clearance.ts";
import type { Primitive, RenderContext } from "./deps.ts";
import { RectCoordsDims, Z_INDEX } from "./deps.ts";
import type { MeasurePaneConfig } from "./measure_types.ts";
import type { OverhangClearance } from "./types.ts";
import { clampOverhangClearance, NO_OVERHANG_CLEARANCE } from "./types.ts";
import type { XTextAxisMeasuredInfo } from "./_axes/x_text/types.ts";
import type { XPeriodAxisMeasuredInfo } from "./_axes/x_period/types.ts";
import type { XScaleAxisMeasuredInfo } from "./_axes/x_scale/types.ts";
import type { YTextAxisWidthInfo } from "./_axes/y_text/types.ts";
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
    tierHeaderAndLabelGapHeight: number;
  },
): Primitive[] {
  const allPrimitives: Primitive[] = [];
  const i_pane = config.indices.pane;
  const baseStyle = config.baseStyle;
  const xAxisConfig = config.xAxisConfig;
  const yAxisConfig = config.yAxisConfig;
  const tierHeaders = config.dataProps.tierHeaders;
  const laneHeaders = config.dataProps.laneHeaders;
  const orientation = config.orientation;

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

  const subChartInfoFor = (i_tier: number, i_lane: number) => ({
    nSerieses: config.dataProps.seriesHeaders.length,
    seriesValArrays: chartData.values[i_pane][i_tier][i_lane],
    i_pane,
    nPanes: config.dataProps.paneHeaders.length,
    paneHeader: config.dataProps.paneHeaders[i_pane],
    i_tier,
    nTiers: tierHeaders.length,
    tierHeader: tierHeaders[i_tier],
    i_lane,
    nLanes: laneHeaders.length,
    laneHeader: laneHeaders[i_lane],
  });

  // Unbalanced tier/lane membership: this pane's visible band subsets
  // (global indices). The tier×lane loop iterates the subset — dropped bands
  // are whole subcharts — while every index used inside stays global.
  const visibleTiersOfPane = config.dataProps.visibleTiersByPane?.[i_pane];
  const visibleLanesOfPane = config.dataProps.visibleLanesByPane?.[i_pane];
  const tierIndices = visibleTiersOfPane ?? tierHeaders.map((_, i) => i);
  const laneIndices = visibleLanesOfPane ?? laneHeaders.map((_, i) => i);

  // Unbalanced indicator membership: this pane's visible subset of the text
  // axis. Positions (slots, ticks, grid lines) use the subset; every data
  // lookup (dense loops, i_val, info callbacks) keeps the GLOBAL index.
  const visibleIndicators = config.dataProps.visibleIndicatorsByPane?.[i_pane];
  const textAxisHeaders = xAxisConfig.type === "text"
    ? xAxisConfig.indicatorHeaders
    : yAxisConfig.type === "text"
    ? yAxisConfig.indicatorHeaders
    : undefined;
  let positionOrdinals: (number | undefined)[] | undefined;
  let visibleTextAxisHeaders: typeof textAxisHeaders;
  if (visibleIndicators !== undefined && textAxisHeaders !== undefined) {
    const ordinals: (number | undefined)[] = textAxisHeaders.map(() =>
      undefined
    );
    visibleIndicators.forEach((globalIdx, ordinal) => {
      ordinals[globalIdx] = ordinal;
    });
    positionOrdinals = ordinals;
    visibleTextAxisHeaders = visibleIndicators.map((i) => textAxisHeaders[i]);
  }
  const nVisibleTextIndicators = visibleTextAxisHeaders?.length;

  // Overhang clearances: inset the scale axis's value range
  // within each plot area so extreme tick labels and edge data labels stay
  // inside the plot rect. start-side overhang can be absorbed by the
  // adjacent axis area (lane 0 left / last tier bottom); end-side aggregates
  // the tick label overhang with the data label requirement. Every consumer
  // of value-axis positions below must receive these same values.
  const sg = baseStyle.grid;
  const hasContent = xAxisConfig.type !== "none" && yAxisConfig.type !== "none";

  let xClearances: OverhangClearance[] | undefined;
  if (xAxisConfig.type === "scale") {
    const mx = measured.xAxisMeasuredInfo as XScaleAxisMeasuredInfo;
    const xOverhang = xAxisConfig.axisStyle.tickLabelAlignment === "inset"
      ? 0
      : Math.max(
        0,
        (mx.xScaleHeightInfo.maxTickLabelW - sg.gridStrokeWidth) / 2,
      );
    const yAxisAreaWidth =
      measured.yAxisWidthInfo.widthIncludingYAxisStrokeWidth;
    xClearances = laneHeaders.map((_, i_lane) => {
      const start = i_lane === 0
        ? Math.max(0, xOverhang - yAxisAreaWidth)
        : xOverhang;
      let end = xOverhang;
      if (
        orientation === "horizontal" && hasContent &&
        yAxisConfig.type === "text"
      ) {
        const valueRange = getXScaleAxisValueRange(
          mx.xScaleHeightInfo,
          i_lane,
        );
        const yCfg = getYAxisRenderConfig(
          yAxisConfig,
          measured.yAxisWidthInfo,
        );
        for (let i_tier = 0; i_tier < tierHeaders.length; i_tier++) {
          end = Math.max(
            end,
            measureDataLabelEndClearance({
              rc,
              seriesVals: chartData.values[i_pane][i_tier][i_lane],
              valueRange,
              orientation,
              contentStyle: baseStyle.content,
              dataLabelsTextStyle: baseStyle.text.dataLabels,
              plotValueExtent: measured.subChartAreaWidth,
              startClearance: start,
              categoryIncrement: 0,
              nVals: yCfg.nVals,
              subChartInfo: subChartInfoFor(i_tier, i_lane),
              seriesHeaders: config.dataProps.seriesHeaders,
              indicatorHeaders: config.dataProps.indicatorHeaders,
            }),
          );
        }
      }
      return clampOverhangClearance(
        { start, end },
        measured.subChartAreaWidth,
      );
    });
  }

  let yClearances: OverhangClearance[] | undefined;
  if (yAxisConfig.type === "scale") {
    const my = measured.yAxisWidthInfo as YScaleAxisWidthInfo;
    const yOverhang = yAxisConfig.axisStyle.tickLabelAlignment === "inset"
      ? 0
      : Math.max(0, my.halfYAxisTickLabelH - sg.gridStrokeWidth / 2);
    const xAxisAreaHeight = measured.xAxisMeasuredInfo.xAxisRcd.h();
    yClearances = tierHeaders.map((_, i_tier) => {
      const start = i_tier === tierHeaders.length - 1
        ? Math.max(0, yOverhang - xAxisAreaHeight)
        : yOverhang;
      let end = yOverhang;
      if (
        orientation === "vertical" && hasContent &&
        (xAxisConfig.type === "text" || xAxisConfig.type === "period")
      ) {
        const valueRange = getScaleAxisValueRange(
          measured.yAxisWidthInfo,
          i_tier,
        );
        const xCfg = getXAxisRenderConfig(
          xAxisConfig,
          measured.xAxisMeasuredInfo,
        );
        for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
          end = Math.max(
            end,
            measureDataLabelEndClearance({
              rc,
              seriesVals: chartData.values[i_pane][i_tier][i_lane],
              valueRange,
              orientation,
              contentStyle: baseStyle.content,
              dataLabelsTextStyle: baseStyle.text.dataLabels,
              plotValueExtent: measured.subChartAreaHeight,
              startClearance: start,
              categoryIncrement: xCfg.categoryIncrement,
              nVals: xCfg.nVals,
              subChartInfo: subChartInfoFor(i_tier, i_lane),
              seriesHeaders: config.dataProps.seriesHeaders,
              indicatorHeaders: config.dataProps.indicatorHeaders,
            }),
          );
        }
      }
      return clampOverhangClearance(
        { start, end },
        measured.subChartAreaHeight,
      );
    });
  }

  let currentPlotAreaY = measured.yAxisRcd.y() + baseStyle.tiers.paddingTop +
    measured.tierHeaderAndLabelGapHeight;

  for (let tierOrdinal = 0; tierOrdinal < tierIndices.length; tierOrdinal++) {
    const i_tier = tierIndices[tierOrdinal];
    let currentPlotAreaX = measured.yAxisRcd.rightX() +
      baseStyle.lanes.paddingLeft;

    for (let laneOrdinal = 0; laneOrdinal < laneIndices.length; laneOrdinal++) {
      const i_lane = laneIndices[laneOrdinal];
      const rcd = new RectCoordsDims({
        x: currentPlotAreaX,
        y: currentPlotAreaY,
        w: measured.subChartAreaWidth,
        h: measured.subChartAreaHeight,
      });

      const xClearance = xClearances?.[i_lane] ?? NO_OVERHANG_CLEARANCE;
      const yClearance = yClearances?.[i_tier] ?? NO_OVERHANG_CLEARANCE;

      // Grid lines
      const horizontalGridLines = calculateYAxisGridLines(
        i_tier,
        rcd,
        baseStyle.grid.gridStrokeWidth,
        yAxisConfig,
        measured.yAxisWidthInfo,
        yClearance,
        nVisibleTextIndicators,
      );
      const verticalGridLines = calculateXAxisGridLines(
        i_lane,
        rcd,
        xAxisConfig,
        measured.xAxisMeasuredInfo,
        baseStyle.grid.gridStrokeWidth,
        xClearance,
        nVisibleTextIndicators,
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

      // Y-axis primitive — per (pane, tier).
      // For scale: one per tier (shared across lanes); guard on generatedYAxes.
      // For text: one per tier drawn only on lane 0 (mirror of X-text in vertical).
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
                yClearance,
                yAxisConfig.axisLabel,
                yAxisConfig.axisStyle,
                baseStyle.grid,
              ),
            );
            generatedYAxes.add(yAxisKey);
            break;
          }
          case "text":
            // First ITERATED lane (mirror of the tierOrdinal === 0 guard).
            if (laneOrdinal === 0) {
              allPrimitives.push(
                generateYTextAxisPrimitive(
                  rc,
                  i_pane,
                  i_tier,
                  measured.yAxisWidthInfo as YTextAxisWidthInfo,
                  measured.yAxisRcd,
                  rcd.y(),
                  measured.subChartAreaHeight,
                  visibleTextAxisHeaders ?? yAxisConfig.indicatorHeaders,
                  yAxisConfig.axisStyle,
                  baseStyle.grid,
                ),
              );
              generatedYAxes.add(yAxisKey);
            }
            break;
          case "none":
            break;
        }
      }

      // X-axis primitive — per (pane, lane).
      // For text/period: drawn once per lane on the first iterated tier (at
      // the bottom of the pane). For scale: same; range varies per lane.
      // First ITERATED tier, not global tier 0 — under unbalanced tier
      // membership a pane's first visible tier may have a global index > 0.
      const xAxisKey = `${i_pane}-${i_lane}`;
      if (!generatedXAxes.has(xAxisKey) && tierOrdinal === 0) {
        switch (xAxisConfig.type) {
          case "text": {
            allPrimitives.push(
              generateXTextAxisPrimitive(
                rc,
                i_pane,
                i_lane,
                rcd.x(),
                measured.xAxisMeasuredInfo as XTextAxisMeasuredInfo,
                visibleTextAxisHeaders ?? xAxisConfig.indicatorHeaders,
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
          case "scale": {
            const mx = measured.xAxisMeasuredInfo as XScaleAxisMeasuredInfo;
            allPrimitives.push(
              generateXScaleAxisPrimitive(
                rc,
                i_pane,
                i_lane,
                mx.xScaleHeightInfo,
                mx.xAxisRcd,
                rcd.x(),
                measured.subChartAreaWidth,
                xClearance,
                xAxisConfig.axisLabel,
                xAxisConfig.axisStyle,
                baseStyle.grid,
              ),
            );
            generatedXAxes.add(xAxisKey);
            break;
          }
          case "none":
            break;
        }
      }

      // Content primitives (skipped when either axis is "none" — maps
      // generate their own primitives).
      if (xAxisConfig.type !== "none" && yAxisConfig.type !== "none") {
        const seriesVals = chartData.values[i_pane][i_tier][i_lane];

        let valueRange;
        let categoryIncrement: number;
        let isCentered: boolean;
        let nVals: number;
        if (orientation === "horizontal") {
          const mx = measured.xAxisMeasuredInfo as XScaleAxisMeasuredInfo;
          valueRange = getXScaleAxisValueRange(mx.xScaleHeightInfo, i_lane);
          const yCfg = getYAxisRenderConfig(
            yAxisConfig,
            measured.yAxisWidthInfo,
          );
          // nVals stays GLOBAL (dense-array loop bound); only the row-height
          // divisor uses this pane's visible slot count.
          nVals = yCfg.nVals;
          isCentered = yCfg.isCentered;
          const nSlots = nVisibleTextIndicators ?? nVals;
          // Per-indicator row height inside the plot area.
          categoryIncrement = isCentered
            ? measured.subChartAreaHeight / Math.max(1, nSlots)
            : (measured.subChartAreaHeight -
              baseStyle.grid.gridStrokeWidth * (nSlots + 1)) /
              Math.max(1, nSlots);
        } else {
          valueRange = getScaleAxisValueRange(measured.yAxisWidthInfo, i_tier);
          const xCfg = getXAxisRenderConfig(
            xAxisConfig,
            measured.xAxisMeasuredInfo,
          );
          categoryIncrement = xCfg.categoryIncrement;
          isCentered = xCfg.isCentered;
          nVals = xCfg.nVals;
        }

        allPrimitives.push(
          ...generateContentPrimitives({
            rc,
            subChartRcd: rcd,
            subChartInfo: subChartInfoFor(i_tier, i_lane),
            seriesVals,
            valueRange,
            valueClearance: orientation === "horizontal"
              ? xClearance
              : yClearance,
            isCentered,
            categoryIncrement,
            gridStrokeWidth: baseStyle.grid.gridStrokeWidth,
            nVals,
            orientation,
            transformedData: {
              seriesHeaders: config.dataProps.seriesHeaders,
              indicatorHeaders: config.dataProps.indicatorHeaders,
            },
            contentStyle: baseStyle.content,
            dataLabelsTextStyle: baseStyle.text.dataLabels,
            boundsUbSeriesVals: chartData.bounds?.ub[i_pane][i_tier][i_lane],
            boundsLbSeriesVals: chartData.bounds?.lb[i_pane][i_tier][i_lane],
            positionOrdinals,
          }),
        );
      }

      currentPlotAreaX += measured.subChartAreaWidth + baseStyle.lanes.gapX;
    }

    currentPlotAreaY += measured.subChartAreaHeight + baseStyle.tiers.gapY +
      measured.tierHeaderAndLabelGapHeight;
  }

  return allPrimitives;
}
