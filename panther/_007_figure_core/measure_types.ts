// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  CustomFigureStyleOptions,
  MeasuredText,
  MergedChartOVStyle,
  MergedGridStyle,
  MergedPaneStyle,
  MergedTimeseriesStyle,
  MergedYScaleAxisStyle,
  RectCoordsDims,
  RenderContext,
  TextInfoUnkeyed,
} from "./deps.ts";
import type { LegendItem } from "./_legend/types.ts";
import type { MeasuredSurrounds } from "./_surrounds/measure_surrounds.ts";
import type { XAxisMeasuredInfo } from "./render_types.ts";
import type { YScaleAxisData, YScaleAxisWidthInfo } from "./types.ts";
import type { PlotAreaInfo } from "./get_plot_area_infos.ts";

export type { MeasuredSurrounds, PlotAreaInfo };

// Legacy interfaces - keeping for compatibility with measurePane function
export interface ChartInputsBase {
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legendItemsOrLabels?: string[] | LegendItem[];
  style?: CustomFigureStyleOptions;
}

// Simplified config interface for chart measurement
export interface SimplifiedChartConfig<TInputs, TData, TStyle> {
  // Pre-computed values
  mergedStyle: TStyle;
  transformedData: TData;
  dataProps: {
    paneHeaders: string[];
    laneHeaders: string[];
    seriesHeaders: string[];
    yScaleAxisData: YScaleAxisData;
  };
  styleProps: {
    hideColHeaders: boolean;
    panes: MergedPaneStyle;
    text: { paneHeaders: TextInfoUnkeyed };
    yScaleAxis: MergedYScaleAxisStyle;
    grid: MergedGridStyle;
    content: { bars: { stacking: string } };
    xAxisStyle: {
      lanePaddingLeft: number;
      lanePaddingRight: number;
      laneGapX: number;
    };
  };

  // X-axis configuration
  xAxisType: "text" | "period" | "scale";
  xAxisMeasureData:
    | {
      type: "text";
      indicatorHeaders: string[];
      nLanes: number;
      mergedStyle: TStyle;
    }
    | {
      type: "period";
      periodType: "year-month" | "year-quarter" | "year";
      nTimePoints: number;
      nLanes: number;
      mergedStyle: TStyle;
    }
    | {
      type: "scale";
      // Future: scale-specific data
    };
}

// Configuration object for measurePane function
export interface MeasurePaneConfig<
  TData,
  TStyle extends (MergedChartOVStyle | MergedTimeseriesStyle),
> {
  indices: {
    pane: number;
    row: number;
    col: number;
  };
  geometry: {
    outerRcd: RectCoordsDims;
    contentRcd: RectCoordsDims;
  };
  header: MeasuredText | undefined;
  dataProps: {
    laneHeaders: string[];
    yScaleAxisData: YScaleAxisData;
  };
  styleProps: {
    yScaleAxis: MergedYScaleAxisStyle;
    grid: MergedGridStyle;
    xAxisStyle: {
      lanePaddingLeft: number;
      lanePaddingRight: number;
      laneGapX: number;
    };
  };
  data: TData;
  style: TStyle;
  xAxisMeasureData:
    | {
      type: "text";
      indicatorHeaders: string[];
      nLanes: number;
      mergedStyle: TStyle;
    }
    | {
      type: "period";
      periodType: "year-month" | "year-quarter" | "year";
      nTimePoints: number;
      nLanes: number;
      mergedStyle: TStyle;
    }
    | {
      type: "scale";
      // Future: scale-specific data
    };
}

// Base measured pane structure
export interface MeasuredPaneBase {
  mPaneHeader?: MeasuredText;
  i_pane: number;
  i_pane_row: number;
  i_pane_col: number;
  paneOuterRcd: RectCoordsDims;
  paneContentRcd: RectCoordsDims;
  xAxisMeasuredInfo: XAxisMeasuredInfo;
  yScaleAxisWidthInfo: YScaleAxisWidthInfo;
  yAxisRcd: RectCoordsDims;
  subChartAreaHeight: number;
  topHeightForLaneHeaders: number;
  plotAreaInfos: PlotAreaInfo[];
}

// Legacy interfaces - keeping for compatibility with measurePane function
export interface MeasuredChartBase<TInputs, TData, TStyle> {
  item: TInputs;
  bounds: RectCoordsDims;
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  mPanes: MeasuredPaneBase[];
  transformedData: TData;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: TStyle;
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legendItemsOrLabels?: string[] | LegendItem[];
}
