// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Primitive, RenderContext } from "./deps.ts";
import { Padding, RectCoordsDims, Z_INDEX } from "./deps.ts";
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
import {
  generateXPeriodAxisPrimitive,
  generateXTextAxisPrimitive,
  generateYScaleAxisPrimitive,
} from "./_axes/generate_axis_primitives.ts";
import type { XTextAxisMeasuredInfo } from "./_axes/x_text/types.ts";
import type { XPeriodAxisMeasuredInfo } from "./_axes/x_period/types.ts";
import {
  generateLaneHeaderLabelPrimitives,
  generatePaneHeaderLabelPrimitive,
  generateTierHeaderLabelPrimitives,
} from "./generate_label_primitives.ts";

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

  // Track which axes we've already generated (one per tier, one per lane)
  const generatedYAxes = new Set<string>();
  const generatedXAxes = new Set<string>();
  const generatedPaneLabels = new Set<number>();
  const generatedTierLabels = new Set<string>();
  const generatedLaneLabels = new Set<number>();

  // Loop over panes → plotAreas (pane × tier × lane)
  for (const mPane of measured.mPanes) {
    // Extract axis rendering configuration for THIS pane
    // (Each pane may have different content width due to Y-axis label widths)
    const xAxisConfig = getXAxisRenderConfig(
      config.xAxisType,
      mPane.xAxisMeasuredInfo,
      config.transformedData as TData & {
        indicatorHeaders?: string[];
        nTimePoints?: number;
      },
      config.mergedStyle,
    );
    // Generate pane header label (once per pane)
    if (!generatedPaneLabels.has(mPane.i_pane) && mPane.mPaneHeader) {
      const panePadding = new Padding(
        (config.mergedStyle as any).panes.padding,
      );
      const paneHeaderPrimitive = generatePaneHeaderLabelPrimitive(
        mPane.mPaneHeader,
        mPane.paneOuterRcd,
        panePadding.pt(),
        panePadding.pl(),
        (config.mergedStyle as any).panes.headerAlignment,
        mPane.i_pane,
      );
      allPrimitives.push(paneHeaderPrimitive);
      generatedPaneLabels.add(mPane.i_pane);
    }

    // Generate tier header labels (once per pane)
    if (!generatedTierLabels.has(`${mPane.i_pane}`)) {
      const tierLabelPrimitives = generateTierHeaderLabelPrimitives(
        rc,
        mPane.yScaleAxisWidthInfo,
        mPane.yAxisRcd,
        mPane.subChartAreaHeight,
        config.transformedData
          .yScaleAxisData as import("./types.ts").YScaleAxisData,
        (config.mergedStyle as any).yScaleAxis,
        mPane.i_pane,
      );
      allPrimitives.push(...tierLabelPrimitives);
      generatedTierLabels.add(`${mPane.i_pane}`);
    }

    // Generate lane header labels (once per pane)
    if (!generatedLaneLabels.has(mPane.i_pane)) {
      const laneHeaderRcd = new RectCoordsDims({
        x: mPane.xAxisMeasuredInfo.xAxisRcd.x(),
        y: mPane.paneContentRcd.y(),
        w: mPane.paneContentRcd.rightX() -
          mPane.xAxisMeasuredInfo.xAxisRcd.x(),
        h: mPane.topHeightForLaneHeaders,
      });
      const laneLabelPrimitives = generateLaneHeaderLabelPrimitives(
        rc,
        config.transformedData.laneHeaders,
        laneHeaderRcd,
        mPane.xAxisMeasuredInfo.subChartAreaWidth,
        (config.mergedStyle as any).xPeriodAxis?.lanePaddingLeft ??
          (config.mergedStyle as any).xTextAxis?.lanePaddingLeft ?? 0,
        (config.mergedStyle as any).xPeriodAxis?.laneGapX ??
          (config.mergedStyle as any).xTextAxis?.laneGapX ?? 0,
        config.mergedStyle as any,
        mPane.i_pane,
      );
      allPrimitives.push(...laneLabelPrimitives);
      generatedLaneLabels.add(mPane.i_pane);
    }

    for (const plotAreaInfo of mPane.plotAreaInfos) {
      // Calculate horizontal grid lines (Y-axis)
      plotAreaInfo.horizontalGridLines = calculateYAxisGridLines(
        plotAreaInfo.i_tier,
        plotAreaInfo.rcd.y(),
        mPane.subChartAreaHeight,
        config.yAxisGridLineConfig,
        mPane.yScaleAxisWidthInfo,
      );

      // Calculate vertical grid lines (X-axis)
      plotAreaInfo.verticalGridLines = calculateXAxisGridLines(
        plotAreaInfo.i_lane,
        plotAreaInfo.rcd,
        config.xAxisGridLineConfig,
        mPane.xAxisMeasuredInfo,
        config.gridStyle.gridStrokeWidth,
      );

      // Generate grid primitive
      allPrimitives.push({
        type: "chart-grid",
        key:
          `grid-${mPane.i_pane}-${plotAreaInfo.i_tier}-${plotAreaInfo.i_lane}`,
        bounds: plotAreaInfo.rcd,
        zIndex: Z_INDEX.GRID,
        meta: {
          paneIndex: mPane.i_pane,
          tierIndex: plotAreaInfo.i_tier,
          laneIndex: plotAreaInfo.i_lane,
        },
        plotAreaRcd: plotAreaInfo.rcd,
        horizontalLines: plotAreaInfo.horizontalGridLines,
        verticalLines: plotAreaInfo.verticalGridLines,
        style: {
          show: config.gridStyle.showGrid,
          strokeColor: config.gridStyle.gridColor,
          strokeWidth: config.gridStyle.gridStrokeWidth,
        },
      });

      // Generate Y-axis primitive (only once per tier in this pane)
      const yAxisKey = `${mPane.i_pane}-${plotAreaInfo.i_tier}`;
      if (!generatedYAxes.has(yAxisKey) && config.yAxisType === "scale") {
        const yAxisPrimitive = generateYScaleAxisPrimitive(
          rc,
          mPane.i_pane,
          plotAreaInfo.i_tier,
          mPane.yScaleAxisWidthInfo,
          mPane.yAxisRcd,
          plotAreaInfo.rcd.y(),
          mPane.subChartAreaHeight,
          config.transformedData
            .yScaleAxisData as import("./types.ts").YScaleAxisData,
          (config.mergedStyle as any).yScaleAxis,
          (config.mergedStyle as any).grid,
        );
        allPrimitives.push(yAxisPrimitive);
        generatedYAxes.add(yAxisKey);
      }

      // Generate X-axis primitive (only once per lane in this pane, only for first tier)
      const xAxisKey = `${mPane.i_pane}-${plotAreaInfo.i_lane}`;
      if (!generatedXAxes.has(xAxisKey) && plotAreaInfo.i_tier === 0) {
        if (config.xAxisType === "text") {
          const xAxisPrimitive = generateXTextAxisPrimitive(
            rc,
            mPane.i_pane,
            plotAreaInfo.i_lane,
            plotAreaInfo.rcd.x(),
            mPane.xAxisMeasuredInfo as XTextAxisMeasuredInfo,
            (config.transformedData as any).indicatorHeaders,
            config.mergedStyle as any,
          );
          allPrimitives.push(xAxisPrimitive);
          generatedXAxes.add(xAxisKey);
        } else if (config.xAxisType === "period") {
          const xAxisPrimitive = generateXPeriodAxisPrimitive(
            rc,
            mPane.i_pane,
            plotAreaInfo.i_lane,
            plotAreaInfo.rcd.x(),
            mPane.xAxisMeasuredInfo as XPeriodAxisMeasuredInfo,
            (config.transformedData as any).nTimePoints,
            (config.transformedData as any).timeMin,
            (config.transformedData as any).periodType,
            config.mergedStyle as any,
          );
          allPrimitives.push(xAxisPrimitive);
          generatedXAxes.add(xAxisKey);
        }
      }

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
