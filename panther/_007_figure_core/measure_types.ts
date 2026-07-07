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
  // Proportional band layout (when active): this pane's visible slot total
  // (Σ over bands of visible indicator counts) and visible band count. The
  // pane's free plot extent is reconstructible as subChartArea* × bandCount;
  // the chart-level panes solve reads these from pass-1 probe layouts.
  proportionalSlotTotal?: number;
  proportionalBandCount?: number;
  // Set by measureChart's panes-mode pass 2: pane extents along this axis
  // are proportional to slot totals at a shared chart-global slotT. The
  // sizing helpers switch their decomposition on this flag ("height" = OH
  // pane heights, "width" = OV pane widths).
  proportionalPanesAxis?: "width" | "height";
};

// Proportional band layout for one pane (proportional.bands): each band
// (tier on OH, lane on OV) is sized by its own visible indicator count at a
// shared slot thickness slotT. bandIndices holds GLOBAL band indices in band
// order — bands with no visible indicators in this pane are dropped (never
// asserted against; empty bands are legitimate data). visibleIndicators and
// bandExtents are parallel to bandIndices; every data lookup keeps global
// indices, only positions use band-local ordinals.
export type PaneBandLayout = {
  bandAxis: "tier" | "lane";
  bandIndices: number[];
  visibleIndicators: number[][];
  slotT: number;
  bandExtents: number[];
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
    // Per-(pane, band) visible indicator subsets for proportional band
    // layout, indexed [pane][GLOBAL band index][global indicator indices].
    // Presence enables proportional band extents (band = tier on ChartOH,
    // lane on ChartOV).
    visibleIndicatorsByPaneBand?: number[][][];
    // Cross-pane proportional pane sizing requested (proportional.panes).
    proportionalPanes?: boolean;
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
    // Per-(pane, band) visible indicator subsets (proportional band layout).
    visibleIndicatorsByPaneBand?: number[][][];
    proportionalPanes?: boolean;
  };
  data: TData;
  baseStyle: MergedChartStyleBase;
  xAxisConfig: XAxisConfig;
  yAxisConfig: YAxisConfig;
  orientation: "vertical" | "horizontal";
  // Chart-global slot thickness threaded in by measureChart's panes-mode
  // pass 2. Absent = measurePane solves its own per-pane slotT locally
  // (bands mode, and every pass-1/layoutOnly probe).
  slotT?: number;
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
