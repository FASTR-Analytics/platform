// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Primitive, RenderContext } from "./deps.ts";
import type { MergedContentStyle, TextInfoUnkeyed } from "./deps.ts";
import { calculateMappedCoordinates } from "./_content/calculate_mapped_coordinates.ts";
import { generateContentPrimitives } from "./_content/generate_content_primitives.ts";
import { getXAxisRenderConfig } from "./_axes/axis_rendering_config.ts";
import {
  calculateXAxisGridLines,
  calculateYAxisGridLines,
  type XAxisGridLineConfig,
  type YAxisGridLineConfig,
} from "./_axes/grid_lines.ts";
import type { MeasuredPaneBase } from "./measure_types.ts";

///////////////////////////////////////////
//                                       //
//    Chart Primitive Generation         //
//                                       //
///////////////////////////////////////////

// Base interface that all transformed data must have
export interface TransformedDataBase {
  seriesHeaders: string[];
  yScaleAxisData: { tierHeaders: string[] };
  laneHeaders: string[];
  paneHeaders: string[];
}

// Grid style configuration
export interface GridStyleConfig {
  showGrid: boolean;
  gridColor: string;
  gridStrokeWidth: number;
}

// Chart primitive generation configuration
export interface ChartPrimitiveConfig<
  TData extends TransformedDataBase,
  TStyle extends
    | import("./deps.ts").MergedChartOVStyle
    | import("./deps.ts").MergedTimeseriesStyle =
      | import("./deps.ts").MergedChartOVStyle
      | import("./deps.ts").MergedTimeseriesStyle,
> {
  // Axis types
  xAxisType: "text" | "period" | "scale";
  yAxisType: "scale" | "text";

  // Grid line configurations
  xAxisGridLineConfig: XAxisGridLineConfig;
  yAxisGridLineConfig: YAxisGridLineConfig;

  // Transformed data
  transformedData: TData;

  // Styles
  gridStyle: GridStyleConfig;
  contentStyle: MergedContentStyle;
  dataLabelsTextStyle: TextInfoUnkeyed;
  mergedStyle: TStyle; // For extracting axis-specific styles in getXAxisRenderConfig
}

// Minimal measured chart structure needed for primitive generation
export interface MeasuredChartForPrimitives {
  mPanes: MeasuredPaneBase[];
}

/**
 * Generate all primitives (grid + content) for a measured chart
 *
 * This is the central pane/tier/lane loop that works for all chart types.
 * Chart modules just need to provide axis configurations and data.
 */
export function generateChartPrimitives<
  TData extends TransformedDataBase,
  TStyle extends
    | import("./deps.ts").MergedChartOVStyle
    | import("./deps.ts").MergedTimeseriesStyle =
      | import("./deps.ts").MergedChartOVStyle
      | import("./deps.ts").MergedTimeseriesStyle,
>(
  rc: RenderContext,
  measured: MeasuredChartForPrimitives,
  config: ChartPrimitiveConfig<TData, TStyle>,
): Primitive[] {
  const allPrimitives: Primitive[] = [];

  // Extract axis rendering configuration
  // (Same for all panes, so we just use the first one)
  // Cast TData to include optional axis-specific properties
  const xAxisConfig = getXAxisRenderConfig(
    config.xAxisType,
    measured.mPanes[0].xAxisMeasuredInfo,
    config.transformedData as TData & {
      indicatorHeaders?: string[];
      nTimePoints?: number;
    },
    config.mergedStyle,
  );

  // Loop over panes → plotAreas (pane × tier × lane)
  for (const mPane of measured.mPanes) {
    for (const plotAreaInfo of mPane.plotAreaInfos) {
      // Calculate horizontal grid lines (Y-axis)
      plotAreaInfo.horizontalGridLines = calculateYAxisGridLines(
        plotAreaInfo.i_tier,
        plotAreaInfo.rcd.y(),
        mPane.subChartAreaHeight,
        config.yAxisGridLineConfig,
      );

      // Calculate vertical grid lines (X-axis)
      plotAreaInfo.verticalGridLines = calculateXAxisGridLines(
        plotAreaInfo.i_lane,
        plotAreaInfo.rcd,
        config.xAxisGridLineConfig,
        config.gridStyle.gridStrokeWidth,
      );

      // Generate grid primitive
      allPrimitives.push({
        type: "chart-grid",
        key:
          `grid-${mPane.i_pane}-${plotAreaInfo.i_tier}-${plotAreaInfo.i_lane}`,
        layer: "grid",
        plotAreaRcd: plotAreaInfo.rcd,
        horizontalLines: plotAreaInfo.horizontalGridLines,
        verticalLines: plotAreaInfo.verticalGridLines,
        style: {
          show: config.gridStyle.showGrid,
          strokeColor: config.gridStyle.gridColor,
          strokeWidth: config.gridStyle.gridStrokeWidth,
        },
        paneIndex: mPane.i_pane,
        tierIndex: plotAreaInfo.i_tier,
        laneIndex: plotAreaInfo.i_lane,
      });

      // Calculate mapped coordinates for content rendering
      const mappedSeriesCoordinates = calculateMappedCoordinates(
        plotAreaInfo.seriesVals,
        plotAreaInfo.rcd,
        xAxisConfig.incrementWidth,
        xAxisConfig.isCentered,
        config.gridStyle.gridStrokeWidth,
        mPane.yScaleAxisWidthInfo,
        plotAreaInfo.i_tier,
      );

      // Generate all content primitives (bars, lines, areas, points, data labels)
      const contentPrimitives = generateContentPrimitives({
        rc,
        mappedSeriesCoordinates,
        subChartRcd: plotAreaInfo.rcd,
        subChartInfo: {
          nSerieses: config.transformedData.seriesHeaders.length,
          seriesValArrays: plotAreaInfo.seriesVals,
          i_pane: mPane.i_pane,
          nPanes: config.transformedData.paneHeaders.length,
          i_tier: plotAreaInfo.i_tier,
          nTiers: config.transformedData.yScaleAxisData.tierHeaders.length,
          i_lane: plotAreaInfo.i_lane,
          nLanes: config.transformedData.laneHeaders.length,
        },
        incrementWidth: xAxisConfig.incrementWidth,
        gridStrokeWidth: config.gridStyle.gridStrokeWidth,
        nVals: xAxisConfig.nVals,
        transformedData: config.transformedData,
        contentStyle: config.contentStyle,
        dataLabelsTextStyle: config.dataLabelsTextStyle,
      });

      allPrimitives.push(...contentPrimitives);
    }
  }

  return allPrimitives;
}
