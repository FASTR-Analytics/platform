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

export const Z_INDEX = {
  // General-purpose layer constants
  BACK: 0,
  FRONT: 999,
  // Chart semantic layers
  BACKGROUND: 0,
  GRID: 100,
  AXIS: 200,
  CONTENT_AREA: 300,
  CONTENT_LINE: 400,
  CONTENT_BAR: 500,
  CONTENT_POINT: 600,
  LABEL: 700,
  LEGEND: 800,
  CAPTION: 900,
  // SimpleViz defaults
  SIMPLEVIZ_ARROW: 490, // Behind boxes by default
  SIMPLEVIZ_BOX: 500,
} as const;

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart-Specific Metadata Types                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// NOTE: These are chart domain concepts but must live in _001_render_system
// because chart primitives (ChartDataPoint, ChartBar, etc.) reference them.
// Since _007_figure_core imports from _001_render_system, the dependency
// hierarchy prevents these types from living in _007_figure_core.

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

export type ChartDataPointPrimitive = {
  type: "chart-data-point";
  key: string;
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

export type ChartLineSeriesPrimitive = {
  type: "chart-line-series";
  key: string;
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

export type ChartAreaSeriesPrimitive = {
  type: "chart-area-series";
  key: string;
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

export type ChartBarPrimitive = {
  type: "chart-bar";
  key: string;
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

export type ChartAxisPrimitive = {
  type: "chart-axis";
  key: string;
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

export type ChartGridPrimitive = {
  type: "chart-grid";
  key: string;
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

export type ChartLegendPrimitive = {
  type: "chart-legend";
  key: string;
  bounds: RectCoordsDims;
  // Pure data - fully serializable
  items: Array<{
    mText: MeasuredText;
    labelPosition: Coordinates;
    symbol:
      | {
        type: "point";
        style: PointStyle;
        position: Coordinates; // Center of point
      }
      | {
        type: "line";
        style: LineStyle;
        position: Coordinates; // Center of line
      }
      | {
        type: "rect";
        style: RectStyle;
        position: RectCoordsDims; // Rectangle bounds
      };
  }>;
  // Optional metadata
  zIndex?: number;
  paneIndex?: number;
  laneIndex?: number;
  tierIndex?: number;
};

export type ChartCaptionPrimitive = {
  type: "chart-caption";
  key: string;
  captionType: "title" | "subtitle" | "footnote" | "caption";
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
//    SimpleViz Primitives                                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type BoxPrimitive = {
  type: "simpleviz-box";
  key: string;
  // Visual
  rcd: RectCoordsDims;
  rectStyle: RectStyle;
  // Text (if present)
  text?: {
    mText: MeasuredText;
    position: Coordinates;
  };
  secondaryText?: {
    mText: MeasuredText;
    position: Coordinates;
  };
  // Metadata
  boxId: string;
  zIndex?: number;
};

export type ArrowPrimitive = {
  type: "simpleviz-arrow";
  key: string;
  // Visual - simple array of points defining the arrow path
  pathCoords: Coordinates[];
  lineStyle: LineStyle;
  arrowheadSize: number; // Size of arrowhead wings
  // Arrowheads (if any)
  arrowheads?: {
    start?: { position: Coordinates; angle: number };
    end?: { position: Coordinates; angle: number };
  };
  // Metadata
  arrowId: string;
  fromBoxId?: string;
  toBoxId?: string;
  zIndex?: number;
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Primitive Union Type                                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type Primitive =
  // Chart content (fine-grained, animatable)
  | ChartDataPointPrimitive
  | ChartLineSeriesPrimitive
  | ChartAreaSeriesPrimitive
  | ChartBarPrimitive
  // Chart structure (coarse-grained)
  | ChartAxisPrimitive
  | ChartGridPrimitive
  | ChartLegendPrimitive
  | ChartCaptionPrimitive
  // SimpleViz primitives
  | BoxPrimitive
  | ArrowPrimitive;
