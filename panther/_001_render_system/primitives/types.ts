// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  Coordinates,
  GenericSeriesInfo,
  GenericValueInfo,
  RectCoordsDims,
} from "../deps.ts";
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
//    Base Primitive Type                                                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type BasePrimitive = {
  type: string;
  key: string;
  bounds: RectCoordsDims;
  zIndex?: number;
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Relative Positioning                                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type RelativePosition =
  | { dx: number; dy: number } // Absolute pixel offsets from bounds origin
  | { rx: number; ry: number } // Relative 0-1 within bounds (0.5 = center)
  | { dx: number; ry: number } // Mixed: absolute x offset, relative y
  | { rx: number; dy: number }; // Mixed: relative x, absolute y offset

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
  relativePosition: RelativePosition;
};

export type BarStackingMode = "stacked" | "imposed" | "grouped";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart Content Primitives (Fine-Grained, Animatable)                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type ChartDataPointPrimitive = BasePrimitive & {
  type: "chart-data-point";
  meta: {
    value: GenericValueInfo;
  };
  // Visual
  coords: Coordinates;
  style: PointStyle;
  dataLabel?: DataLabel;
  // Optional metadata
  sourceData?: any;
};

export type ChartLineSeriesPrimitive = BasePrimitive & {
  type: "chart-line-series";
  meta: {
    series: GenericSeriesInfo;
    valueIndices: number[]; // Parallel to coords/values
  };
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
};

export type ChartAreaSeriesPrimitive = BasePrimitive & {
  type: "chart-area-series";
  meta: {
    series: GenericSeriesInfo;
    valueIndices: number[];
  };
  // Visual
  coords: Coordinates[];
  style: AreaStyle;
  // Optional metadata
  sourceData?: any;
};

export type ChartBarPrimitive = BasePrimitive & {
  type: "chart-bar";
  meta: {
    value: GenericValueInfo;
  };
  stackingMode: BarStackingMode;
  stackInfo?: {
    isTopOfStack: boolean;
    stackTotal: number;
    positionInStack: number;
  };
  // Visual
  orientation: "vertical" | "horizontal";
  style: RectStyle;
  dataLabel?: DataLabel;
  // Optional metadata
  sourceData?: any;
};

export type ChartErrorBarPrimitive = BasePrimitive & {
  type: "chart-error-bar";
  meta: {
    value: GenericValueInfo;
  };
  // Visual
  centerX: number;
  ubY: number;
  lbY: number;
  strokeColor: string;
  strokeWidth: number;
  capWidth: number;
  // Optional metadata
  sourceData?: any;
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart Structural Primitives (Coarse-Grained)                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type ChartAxisPrimitive = BasePrimitive & {
  type: "chart-axis";
  meta: {
    axisType: "x-text" | "x-period" | "y-scale";
    paneIndex: number;
    laneIndex: number;
    tierIndex?: number; // Some axes span all tiers
  };
  // Pure data - fully serializable
  ticks: Array<{
    position: Coordinates;
    tickLine?: { start: Coordinates; end: Coordinates };
    label?: {
      mText: MeasuredText;
      position: Coordinates;
      alignment: {
        h: "left" | "center" | "right";
        v: "top" | "center" | "bottom";
      };
    };
    value: number | string;
  }>;
  axisLine?: { coords: Coordinates[]; style: LineStyle };
};

export type ChartGridPrimitive = BasePrimitive & {
  type: "chart-grid";
  meta: {
    paneIndex: number;
    tierIndex: number;
    laneIndex: number;
  };
  plotAreaRcd: RectCoordsDims;
  horizontalLines: { y: number; tickValue: number }[];
  verticalLines: { x: number; tickValue?: number }[];
  style: {
    show: boolean;
    strokeColor: string;
    strokeWidth: number;
  };
};

export type ChartLegendPrimitive = BasePrimitive & {
  type: "chart-legend";
  meta: {
    paneIndex?: number; // Optional - can be figure-level or pane-level
  };
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
        coords: Coordinates[]; // Line endpoints
      }
      | {
        type: "rect";
        style: RectStyle;
        position: RectCoordsDims; // Rectangle bounds
      };
  }>;
};

export type ChartCaptionPrimitive = BasePrimitive & {
  type: "chart-caption";
  meta: {
    captionType: "title" | "subtitle" | "footnote" | "caption";
    paneIndex?: number; // Captions can be figure-level (no pane) or pane-level
  };
  mText: MeasuredText;
  // Pure data - fully serializable
  position: Coordinates;
  alignment: {
    h: "left" | "center" | "right";
    v: "top" | "center" | "bottom";
  };
};

export type ChartLabelPrimitive = BasePrimitive & {
  type: "chart-label";
  meta: {
    labelType: "pane" | "tier" | "lane";
    paneIndex: number;
    tierIndex?: number; // Only for tier labels
    laneIndex?: number; // Only for lane labels
  };
  mText: MeasuredText;
  // Pure data - fully serializable
  position: Coordinates;
  alignment: {
    h: "left" | "center" | "right";
    v: "top" | "center" | "bottom";
  };
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    SimpleViz Primitives                                                    //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type BoxPrimitive = BasePrimitive & {
  type: "simpleviz-box";
  meta: {
    boxId: string;
  };
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
};

export type ArrowPrimitive = BasePrimitive & {
  type: "simpleviz-arrow";
  meta: {
    arrowId: string;
    fromBoxId?: string;
    toBoxId?: string;
  };
  // Visual - simple array of points defining the arrow path
  pathCoords: Coordinates[];
  lineStyle: LineStyle;
  arrowheadSize: number; // Size of arrowhead wings
  // Arrowheads (if any)
  arrowheads?: {
    start?: { position: Coordinates; angle: number };
    end?: { position: Coordinates; angle: number };
  };
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
  | ChartErrorBarPrimitive
  // Chart structure (coarse-grained)
  | ChartAxisPrimitive
  | ChartGridPrimitive
  | ChartLegendPrimitive
  | ChartCaptionPrimitive
  | ChartLabelPrimitive
  // SimpleViz primitives
  | BoxPrimitive
  | ArrowPrimitive;
