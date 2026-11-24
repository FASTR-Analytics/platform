// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  DataDimension,
  FigureFitReport,
  MeasuredText,
  MergedChartStyleBase,
  Primitive,
  RectCoordsDims,
} from "./deps.ts";
import type { LegendInput } from "./_legend/scale_legend_types.ts";
import type { LegendSeries } from "./_legend/types.ts";
import type { MeasuredSurrounds } from "./_surrounds/measure_surrounds.ts";
import type { ChartAxesConfig } from "./_axes/axis_configs.ts";
import type { MeasuredXAxis } from "./_axes/measure_x_axis.ts";
import type { MeasuredYAxis } from "./_axes/measure_y_axis.ts";
import type { PaneGrid } from "./dimension_helpers.ts";
import type { SubChartTextDataConfig } from "./types.ts";

export type { MeasuredSurrounds };

// Geometry produced by measurePane for one pane — used by getIdealHeight to
// invert the decomposition H = overhead(width) + nPaneRows×nTiers×uniformSubChartHeight.
export type PaneLayout = {
  uniformSubChartHeight: number;
  uniformSubChartWidth: number;
  topHeightForLaneHeaders: number;
  tierHeaderAndLabelGapHeight: number;
  yAxesWidth: number; // both y axes, strokes included — real value for min-width calc
  paneInnerWidth: number; // pane inner width — the y-text axis label wrap basis
  // Proportional tier-or-lane layout (when active): this pane's visible slot total
  // (Σ over tiers or lanes of visible indicator counts) and visible tier-or-lane count. The
  // pane's free category-axis extent is reconstructible as uniformSubChart* × nTiersOrLanes;
  // the chart-level panes solve reads these from pass-1 probe layouts.
  nProportionalSlots?: number;
  nProportionalTiersOrLanes?: number;
  // Set by measureChart's panes-mode pass 2: pane extents along this direction
  // are proportional to slot totals at a shared chart-global slotExtent. The
  // sizing helpers switch their decomposition on this flag ("height" = OH
  // pane heights, "width" = OV pane widths).
  proportionalPanesDirection?: "width" | "height";
};

// Proportional tier-or-lane layout for one pane (proportional.tiersOrLanes): each tier or lane
// (tier on OH, lane on OV) is sized by its own visible indicator count at a
// shared slot thickness slotExtent. tierOrLaneIndices holds GLOBAL tier-or-lane indices in tier or lane
// order — tiers or lanes with no visible indicators in this pane are dropped (never
// asserted against; empty tiers or lanes are legitimate data). visibleIndicators and
// tierOrLaneExtents are parallel to tierOrLaneIndices; every data lookup keeps global
// indices, only positions use tier-or-lane-local ordinals.
export type PaneTierOrLaneLayout = {
  tierOrLaneDimension: "tier" | "lane";
  tierOrLaneIndices: number[];
  visibleIndicators: number[][];
  slotExtent: number;
  tierOrLaneExtents: number[];
};

export type SimplifiedChartConfig<
  TData,
  TStyle extends MergedChartStyleBase,
> = {
  mergedStyle: TStyle;
  transformedData: TData;
  dataDimensions: {
    // With no prop there is no dimension; a timeseries has no indicator dimension, its
    // period being the x-axis.
    pane?: DataDimension;
    tier?: DataDimension;
    lane?: DataDimension;
    series?: DataDimension;
    indicator?: DataDimension;
  };
  masks?: {
    // Per-pane masks (global indices, array order = slot order). Absent =
    // balanced and no value sort (every pane shows the full global set in
    // storage order). Only the categorical-direction dims are ever masked:
    // indicators + lanes on ChartOV, indicators + tiers on ChartOH.
    visibleIndicatorsByPane?: number[][];
    visibleTiersByPane?: number[][];
    visibleLanesByPane?: number[][];
    // Per-(pane, tier or lane) visible indicator subsets for proportional tier or lane
    // layout, indexed [pane][GLOBAL tier-or-lane index][global indicator indices].
    // Presence enables proportional tier-or-lane extents (a tier on ChartOH,
    // lane on ChartOV).
    visibleIndicatorsByPaneTierOrLane?: number[][][];
    // Cross-pane proportional pane sizing requested (proportional.panes).
    proportionalPanes?: boolean;
  };
  axes: ChartAxesConfig;
  subChartTexts?: SubChartTextDataConfig[];
  resolvedLegend?: LegendInput;
  legendSeries?: LegendSeries;
  // Resolved by the caller (resolvePaneGrid at the applied fit scale and the
  // frame width), never here: the measured content width would not match
  // the fit decision's estimate.
  paneGrid: PaneGrid;
};

export type MeasurePaneConfig<TData> = {
  i_pane: number;
  geometry: {
    outerRcd: RectCoordsDims;
    innerRcd: RectCoordsDims;
  };
  paneHeader?: MeasuredText;
  // Chart-global slot thickness threaded in by measureChart's panes-mode
  // pass 2. Absent = measurePane solves its own per-pane slotExtent locally
  // (tiers-or-lanes mode, and every pass-1/layoutOnly probe).
  slotExtent?: number;
  chart: SimplifiedChartConfig<TData, MergedChartStyleBase>;
};

export type MeasuredAxes =
  | {
    kind: "category-and-value";
    orientation: "vertical";
    x: Extract<MeasuredXAxis, { type: "text" | "period" }>;
    y: Extract<MeasuredYAxis, { type: "value" }>;
    secondY?: Extract<MeasuredYAxis, { type: "value" }>;
  }
  | {
    kind: "category-and-value";
    orientation: "horizontal";
    x: Extract<MeasuredXAxis, { type: "value" }>;
    y: Extract<MeasuredYAxis, { type: "text" }>;
    secondX?: Extract<MeasuredXAxis, { type: "value" }>;
  }
  | {
    kind: "value-and-value";
    x: Extract<MeasuredXAxis, { type: "value" }>;
    y: Extract<MeasuredYAxis, { type: "value" }>;
  }
  | { kind: "none"; xAxisRcd: RectCoordsDims };

export type MeasuredChartBase<TInputs, TData, TStyle> = {
  inputs: TInputs;
  bounds: RectCoordsDims;
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  transformedData: TData;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: TStyle;
  title?: string;
  subtitle?: string;
  footnote?: string | string[];
  legend?: LegendInput;
  primitives: Primitive[];
  // Per-pane geometry from measurePane — used by getIdealHeight decomposition.
  paneLayouts: PaneLayout[];
  // shrink-to-fit shrank to the legibility floor and content still overflows.
  cramped?: boolean;
  // Post-measure fit metrics. Undefined when autofit was disabled.
  fitReport?: FigureFitReport;
};
