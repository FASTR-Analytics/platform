// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

/**
 * PANE / TIER / LANE STRUCTURE
 *
 * Charts are organized in a three-level hierarchy that creates independent plot areas:
 *
 * 1. PANE: Top-level subdivision for multi-chart figures
 *    - Each pane is an independent chart (e.g., different time periods, regions, or categories)
 *    - Panes are laid out in a grid (rows × columns)
 *    - Example: Separate panes for "North", "South", "East", "West" regions
 *
 * 2. TIER: Y-axis subdivision within a pane
 *    - Determined by Y-axis type (ranges for scale axis, categories for text axis)
 *    - For scale axis: Different Y ranges (e.g., 0-100, 100-200, 200-300)
 *    - For text axis: Different Y categories (e.g., "Product A", "Product B", "Product C")
 *    - Tiers stack vertically with gaps between them
 *    - Example: Multiple products shown as separate horizontal bands
 *
 * 3. LANE: X-axis subdivision within a pane
 *    - Determined by X-axis type (periods/categories for current, ranges for scale axis)
 *    - For period axis: Different time periods (usually just one lane)
 *    - For text axis: Different X categories (usually just one lane)
 *    - For scale axis: Different X ranges (e.g., 0-50, 50-100)
 *    - Lanes arrange horizontally with gaps between them
 *    - Example: Different product categories side by side
 *
 * PLOT AREA: The (pane × tier × lane) combination where content actually renders
 *    - Each plot area has its own coordinate space
 *    - Content primitives (bars, lines, points, areas) are generated per plot area
 *    - Grid lines are calculated per plot area
 *
 * The looping structure `for pane, for tier, for lane` is consistent across all
 * chart types. What varies is:
 * - How tier boundaries are determined (Y-axis type)
 * - How lane boundaries are determined (X-axis type)
 * - How data coordinates map to plot area coordinates (axis type combinations)
 *
 * CHART TYPE AXIS COMBINATIONS:
 * - Timeseries: X-period + Y-scale
 * - ChartOV: X-text + Y-scale
 * - ChartOH (future): X-scale + Y-text
 * - ChartTwoWay (future): X-scale + Y-scale
 */

import {
  measureYScaleAxis,
  measureYScaleAxisWidthInfo,
} from "./_axes/y_scale/measure.ts";
import { measureXAxis } from "./_axes/measure_x_axis.ts";
import type {
  MergedChartOVStyle,
  MergedTimeseriesStyle,
  RenderContext,
} from "./deps.ts";
import { getTopHeightForLaneHeaders } from "./lane_headers.ts";
import type { MeasuredPaneBase, MeasurePaneConfig } from "./measure_types.ts";
import { getPlotAreaInfos } from "./get_plot_area_infos.ts";

// Shared function for measuring a single pane
export function measurePane<
  TData,
  TStyle extends MergedChartOVStyle | MergedTimeseriesStyle,
>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData, TStyle>,
): MeasuredPaneBase {
  const yScaleAxisWidthInfo = measureYScaleAxisWidthInfo(
    rc,
    config.dataProps.yScaleAxisData,
    config.styleProps.yScaleAxis,
    config.styleProps.grid,
    config.geometry.contentRcd,
    config.indices.pane,
  );

  // Type narrowing: TStyle is constrained to MergedChartOVStyle | MergedTimeseriesStyle
  // So we can safely cast config.xAxisMeasureData to the expected XAxisMeasureData type
  const xAxisMeasuredInfo = measureXAxis(
    rc,
    config.geometry.contentRcd,
    yScaleAxisWidthInfo,
    config
      .xAxisMeasureData as import("./_axes/measure_x_axis.ts").XAxisMeasureData,
  );

  const topHeightForLaneHeaders = getTopHeightForLaneHeaders(
    rc,
    xAxisMeasuredInfo.subChartAreaWidth,
    config.dataProps.laneHeaders,
    config.style,
  );

  const { yAxisRcd, subChartAreaHeight } = measureYScaleAxis(
    topHeightForLaneHeaders,
    xAxisMeasuredInfo.xAxisRcd.h(),
    yScaleAxisWidthInfo,
    config.dataProps.yScaleAxisData,
    config.styleProps.yScaleAxis,
    config.geometry.contentRcd,
  );

  // Cast data to access values property - we know chart data has this structure
  const chartData = config.data as TData & {
    values: (number | undefined)[][][][][];
  };

  const plotAreaInfos = getPlotAreaInfos({
    // Geometric
    yAxisRcd,
    plotAreaHeight: subChartAreaHeight,
    plotAreaWidth: xAxisMeasuredInfo.subChartAreaWidth,

    // Data
    values: chartData.values,
    i_pane: config.indices.pane,
    tierHeaders: config.dataProps.yScaleAxisData.tierHeaders,
    laneHeaders: config.dataProps.laneHeaders,

    // Styling
    tierPaddingTop: config.styleProps.yScaleAxis.tierPaddingTop,
    tierGapY: config.styleProps.yScaleAxis.tierGapY,
    lanePaddingLeft: config.styleProps.xAxisStyle.lanePaddingLeft,
    laneGapX: config.styleProps.xAxisStyle.laneGapX,
  });

  const mPane = {
    mPaneHeader: config.header,
    i_pane: config.indices.pane,
    i_pane_row: config.indices.row,
    i_pane_col: config.indices.col,
    paneOuterRcd: config.geometry.outerRcd,
    paneContentRcd: config.geometry.contentRcd,
    yScaleAxisWidthInfo,
    yAxisRcd,
    subChartAreaHeight,
    topHeightForLaneHeaders,
    xAxisMeasuredInfo,
    plotAreaInfos,
  };

  return mPane;
}
