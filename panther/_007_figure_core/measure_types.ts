// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  FigureFitReport,
  HeaderItem,
  MeasuredText,
  MergedChartStyleBase,
  Primitive,
  RectCoordsDims,
} from "./deps.ts";
import type { LegendInput } from "./_legend/scale_legend_types.ts";
import type { MeasuredSurrounds } from "./_surrounds/measure_surrounds.ts";
import type { XAxisConfig, YAxisConfig } from "./_axes/axis_configs.ts";

export type { MeasuredSurrounds };

// Geometry produced by measurePane for one pane — used by getIdealHeight to
// invert the decomposition H = overhead(width) + nGRows×nTiers×subChartAreaH.
export type PaneLayout = {
  subChartAreaHeight: number;
  subChartAreaWidth: number;
  topHeightForLaneHeaders: number;
  tierHeaderAndLabelGapHeight: number;
  yAxisWidth: number; // widthIncludingYAxisStrokeWidth — real value for min-width calc
  paneContentWidth: number; // pane content width — the y-text axis label wrap basis
};

export interface SimplifiedChartConfig<
  TInputs,
  TData,
  TStyle extends MergedChartStyleBase,
> {
  mergedStyle: TStyle;
  transformedData: TData;
  dataProps: {
    paneHeaders: HeaderItem[];
    tierHeaders: HeaderItem[];
    laneHeaders: HeaderItem[];
    seriesHeaders: HeaderItem[];
    indicatorHeaders?: HeaderItem[];
    // Per-pane visible subsets (global indices) for unbalanced membership.
    // Absent = balanced (every pane shows the full global set). Only the
    // categorical-direction dims are ever masked: indicators + lanes on
    // ChartOV, indicators + tiers on ChartOH.
    visibleIndicatorsByPane?: number[][];
    visibleTiersByPane?: number[][];
    visibleLanesByPane?: number[][];
  };
  xAxisConfig: XAxisConfig;
  yAxisConfig: YAxisConfig;
  orientation: "vertical" | "horizontal";
  resolvedLegend?: LegendInput;
}

export interface MeasurePaneConfig<TData> {
  indices: {
    pane: number;
    row: number;
    col: number;
  };
  geometry: {
    outerRcd: RectCoordsDims;
    contentRcd: RectCoordsDims;
  };
  paneHeader: MeasuredText | undefined;
  dataProps: {
    paneHeaders: HeaderItem[];
    tierHeaders: HeaderItem[];
    laneHeaders: HeaderItem[];
    seriesHeaders: HeaderItem[];
    indicatorHeaders?: HeaderItem[];
    // Per-pane visible subsets (global indices). Absent = balanced.
    visibleIndicatorsByPane?: number[][];
    visibleTiersByPane?: number[][];
    visibleLanesByPane?: number[][];
  };
  data: TData;
  baseStyle: MergedChartStyleBase;
  xAxisConfig: XAxisConfig;
  yAxisConfig: YAxisConfig;
  orientation: "vertical" | "horizontal";
}

export interface MeasuredChartBase<TInputs, TData, TStyle> {
  item: TInputs;
  bounds: RectCoordsDims;
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  transformedData: TData;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: TStyle;
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legend?: LegendInput;
  primitives: Primitive[];
  // Per-pane geometry from measurePane — used by getIdealHeight decomposition.
  paneLayouts: PaneLayout[];
  // shrink-to-fit shrank to the legibility floor and content still overflows.
  cramped?: boolean;
  // Post-measure fit metrics. Undefined when autofit was disabled.
  fitReport?: FigureFitReport;
}
