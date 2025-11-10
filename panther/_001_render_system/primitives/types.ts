// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Coordinates, RectCoordsDims } from "../deps.ts";
import type {
  AreaStyle,
  LineStyle,
  MeasuredText,
  PointStyle,
  RectStyle,
} from "../render_context.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Shared Types                                                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type PrimitiveLayer =
  | "background"
  | "grid"
  | "axis"
  | "content-area"
  | "content-line"
  | "content-bar"
  | "content-point"
  | "label"
  | "legend"
  | "surround";

export type DataLabel = {
  text: string;
  mText: MeasuredText;
  position: "top" | "left" | "bottom" | "right" | "center";
  offsetFromElement: number;
};

export type BarStackingMode = "stacked" | "imposed" | "grouped";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart Content Primitives (Fine-Grained, Animatable)                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type ChartDataPoint = {
  type: "chart-data-point";
  key: string;
  layer: PrimitiveLayer;
  // Chart semantics
  seriesIndex: number;
  valueIndex: number;
  value: number;
  // Visual
  coords: Coordinates;
  style: PointStyle;
  dataLabel?: DataLabel;
  // Optional metadata
  sourceData?: any;
  zIndex?: number;
  paneIndex?: number;
  laneIndex?: number;
  tierIndex?: number;
};

export type ChartLineSeries = {
  type: "chart-line-series";
  key: string;
  layer: PrimitiveLayer;
  // Chart semantics
  seriesIndex: number;
  valueIndices: number[]; // Parallel to coords/values
  values: number[];
  // Visual
  coords: Coordinates[];
  style: LineStyle;
  segments?: {
    start: number; // 0-1 along path for partial animations
    end: number;
  };
  pointLabels?: Array<{
    coordIndex: number;
    dataLabel: DataLabel;
  }>;
  // Optional metadata
  sourceData?: any;
  zIndex?: number;
  paneIndex?: number;
  laneIndex?: number;
  tierIndex?: number;
};

export type ChartAreaSeries = {
  type: "chart-area-series";
  key: string;
  layer: PrimitiveLayer;
  // Chart semantics
  seriesIndex: number;
  valueIndices: number[];
  values: number[];
  // Visual
  coords: Coordinates[];
  style: AreaStyle;
  // Optional metadata
  sourceData?: any;
  zIndex?: number;
  paneIndex?: number;
  laneIndex?: number;
  tierIndex?: number;
};

export type ChartBar = {
  type: "chart-bar";
  key: string;
  layer: PrimitiveLayer;
  // Chart semantics
  seriesIndex: number;
  valueIndex: number;
  value: number;
  stackingMode: BarStackingMode;
  stackInfo?: {
    isTopOfStack: boolean;
    stackTotal: number;
    positionInStack: number;
  };
  // Visual
  orientation: "vertical" | "horizontal";
  rcd: RectCoordsDims;
  style: RectStyle;
  dataLabel?: DataLabel;
  // Optional metadata
  sourceData?: any;
  zIndex?: number;
  paneIndex?: number;
  laneIndex?: number;
  tierIndex?: number;
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart Structural Primitives (Coarse-Grained)                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type ChartAxis = {
  type: "chart-axis";
  key: string;
  layer: PrimitiveLayer;
  axisType: "x-text" | "x-period" | "y-scale";
  bounds: RectCoordsDims;
  // Pure data - fully serializable
  ticks: Array<{
    position: Coordinates;
    tickLine: { start: Coordinates; end: Coordinates };
    label?: { mText: MeasuredText; position: Coordinates };
    value: number | string;
  }>;
  axisLine?: { coords: Coordinates[]; style: LineStyle };
  // Optional metadata
  zIndex?: number;
  paneIndex?: number;
  laneIndex?: number;
  tierIndex?: number;
};

export type ChartGrid = {
  type: "chart-grid";
  key: string;
  layer: PrimitiveLayer;
  plotAreaRcd: RectCoordsDims;
  horizontalLines: { y: number; tickValue: number }[];
  verticalLines: { x: number; tickValue?: number }[];
  style: {
    show: boolean;
    strokeColor: string;
    strokeWidth: number;
  };
  // Optional metadata
  zIndex?: number;
  paneIndex?: number;
  laneIndex?: number;
  tierIndex?: number;
};

export type ChartLegend = {
  type: "chart-legend";
  key: string;
  layer: PrimitiveLayer;
  bounds: RectCoordsDims;
  // Pure data - fully serializable
  items: Array<{
    label: string;
    symbol: {
      type: "point" | "line" | "rect";
      style: PointStyle | LineStyle | RectStyle;
    };
    position: Coordinates;
  }>;
  // Optional metadata
  zIndex?: number;
  paneIndex?: number;
  laneIndex?: number;
  tierIndex?: number;
};

export type ChartSurround = {
  type: "chart-surround";
  key: string;
  layer: PrimitiveLayer;
  surroundType: "title" | "subtitle" | "footnote" | "caption";
  bounds: RectCoordsDims;
  mText: MeasuredText;
  // Pure data - fully serializable
  position: Coordinates;
  alignment: {
    h: "left" | "center" | "right";
    v: "top" | "center" | "bottom";
  };
  // Optional metadata
  zIndex?: number;
  paneIndex?: number;
  laneIndex?: number;
  tierIndex?: number;
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Primitive Union Type                                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type Primitive =
  // Chart content (fine-grained, animatable)
  | ChartDataPoint
  | ChartLineSeries
  | ChartAreaSeries
  | ChartBar
  // Chart structure (coarse-grained)
  | ChartAxis
  | ChartGrid
  | ChartLegend
  | ChartSurround;

// Convenience alias for backwards compatibility during migration
export type ChartPrimitive = Primitive;
