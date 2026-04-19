// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  ChartSeriesInfo,
  ChartValueInfo,
  ColorAdjustmentStrategy,
  ColorKeyOrString,
  Coordinates,
  Padding,
  RectCoordsDims,
} from "../deps.ts";
import type {
  AreaStyle,
  LineStyle,
  MeasuredText,
  PathSegment,
  PathStyle,
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
  // Cascade defaults
  CASCADE_ARROW: 550,
  // Map defaults
  MAP_REGION: 300,
  MAP_LABEL: 750,
  // Sankey defaults
  SANKEY_LINK: 300,
  SANKEY_NODE: 400,
  // Table layers (ordered back-to-front)
  TABLE_HEADER_BG: 50,
  TABLE_CELL_BG: 100,
  TABLE_GRID_LINE: 200,
  TABLE_HEADER_AXIS: 250,
  TABLE_BORDER: 300,
  TABLE_TEXT: 400,
  ANNOTATION_RECT: 750,
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
  annotationGroup?: string;
  annotationBounds?: RectCoordsDims;
};

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
  mText: MeasuredText;
  position: Coordinates;
  alignH: "left" | "center" | "right";
  alignV: "top" | "middle" | "bottom";
  style?: {
    backgroundColor?: string;
    padding?: Padding;
    border?: { color: string; width: number };
    rectRadius?: number;
  };
};

export type BarStackingMode = "stacked" | "imposed" | "diff" | "grouped";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart Content Primitives (Fine-Grained, Animatable)                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type ChartDataPointPrimitive = BasePrimitive & {
  type: "chart-data-point";
  meta: {
    value: ChartValueInfo;
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
    series: ChartSeriesInfo;
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
    series: ChartSeriesInfo;
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
    value: ChartValueInfo;
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
    value: ChartValueInfo;
  };
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  capWidth: number;
  // Optional metadata
  sourceData?: any;
} & (
  | { orientation: "vertical"; centerX: number; ubY: number; lbY: number }
  | { orientation: "horizontal"; centerY: number; ubX: number; lbX: number }
);

export type ChartConfidenceBandPrimitive = BasePrimitive & {
  type: "chart-confidence-band";
  meta: {
    series: ChartSeriesInfo;
  };
  coords: Coordinates[];
  style: {
    fillColor: ColorKeyOrString;
    fillColorAdjustmentStrategy: ColorAdjustmentStrategy;
  };
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart Structural Primitives (Coarse-Grained)                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type ChartAxisPrimitive = BasePrimitive & {
  type: "chart-axis";
  meta: {
    axisType: "x-text" | "x-period" | "x-scale" | "y-scale" | "y-text";
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
        v: "top" | "middle" | "bottom";
      };
    };
    value: number | string;
  }>;
  axisLine: { coords: Coordinates[]; style: LineStyle };
  tickStyle: LineStyle;
  axisLabel?: {
    mText: MeasuredText;
    position: Coordinates;
    alignment: { h: AlignH; v: AlignV };
  };
};

export type ChartGridPrimitive = BasePrimitive & {
  type: "chart-grid";
  meta: {
    paneIndex: number;
    tierIndex: number;
    laneIndex: number;
  };
  plotAreaRcd: RectCoordsDims;
  horizontalLines: { y: number; tickValue?: number }[];
  verticalLines: { x: number; tickValue?: number }[];
  style: {
    show: boolean;
    strokeColor: string;
    strokeWidth: number;
    backgroundColor: string | "none";
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
    v: "top" | "middle" | "bottom";
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
  alignment: {
    h: "left" | "center" | "right";
    v: "top" | "middle" | "bottom";
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
//    Sankey Primitives                                                       //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type SankeyNodePrimitive = BasePrimitive & {
  type: "sankey-node";
  meta: {
    nodeId: string;
    column: number;
  };
  // Visual
  rcd: RectCoordsDims;
  fillColor: string;
  // Label (if present)
  label?: {
    mText: MeasuredText;
    position: Coordinates;
    alignH: "left" | "right";
  };
};

export type SankeyLinkPrimitive = BasePrimitive & {
  type: "sankey-link";
  meta: {
    fromNodeId: string;
    toNodeId: string;
    value: number;
  };
  // Visual - path segments for bezier curve rendering
  pathSegments: PathSegment[];
  pathStyle: PathStyle;
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Cascade Primitives                                                      //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type CascadeArrowPrimitive = BasePrimitive & {
  type: "cascade-arrow";
  meta: {
    i_fromStage: number;
    i_toStage: number;
    i_series: number;
    relRetention: number;
  };
  pathSegments: PathSegment[];
  pathStyle: PathStyle;
  arrowhead?: {
    position: Coordinates;
    angle: number;
    size: number;
  };
  dataLabel?: DataLabel;
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Map Primitives                                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type MapRegionPrimitive = BasePrimitive & {
  type: "map-region";
  meta: {
    featureId: string;
    paneIndex: number;
    tierIndex: number;
    laneIndex: number;
    value?: number;
  };
  pathSegments: PathSegment[];
  pathStyle: PathStyle;
};

export type MapLabelPrimitive = BasePrimitive & {
  type: "map-label";
  meta: {
    featureId: string;
    paneIndex: number;
    tierIndex: number;
    laneIndex: number;
    placement: "centroid" | "callout";
  };
  mText: MeasuredText;
  position: Coordinates;
  alignment: {
    h: "left" | "center" | "right";
    v: "top" | "middle" | "bottom";
  };
  halo?: {
    color: string;
    width: number;
    rectRadius?: number;
  };
  leaderLine?: {
    from: Coordinates;
    to: Coordinates;
    strokeColor: string;
    strokeWidth: number;
    gap: number;
  };
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Scale Legend Primitives                                                  //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type ScaleLegendGradientPrimitive = BasePrimitive & {
  type: "scale-legend-gradient";
  colorStops: { t: number; color: string }[];
  barRect: RectCoordsDims;
  ticks: {
    pixelOffset: number;
    mText: MeasuredText;
    labelPosition: Coordinates;
  }[];
  noData?: {
    rect: RectCoordsDims;
    style: RectStyle;
    mText: MeasuredText;
    labelPosition: Coordinates;
  };
};

export type ScaleLegendSteppedPrimitive = BasePrimitive & {
  type: "scale-legend-stepped";
  steps: { rect: RectCoordsDims; style: RectStyle }[];
  labels: { mText: MeasuredText; position: Coordinates }[];
  noData?: {
    rect: RectCoordsDims;
    style: RectStyle;
    mText: MeasuredText;
    labelPosition: Coordinates;
  };
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Table Primitives                                                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type TableCellPrimitive = BasePrimitive & {
  type: "table-cell";
  meta: {
    i_row: number;
    i_col: number;
    rowHeader: string;
    colHeader: string;
  };
  backgroundColor: ColorKeyOrString | "none";
  mText: MeasuredText;
  textPosition: Coordinates;
  textAlignH: "left" | "center" | "right";
  textAlignV: "top" | "middle" | "bottom";
};

export type TableRowHeaderPrimitive = BasePrimitive & {
  type: "table-row-header";
  meta: {
    i_row: number | "group-header";
    label: string;
    isGroupHeader: boolean;
  };
  mText: MeasuredText;
  textPosition: Coordinates;
  textAlignH: "left" | "center" | "right";
};

export type TableColHeaderPrimitive = BasePrimitive & {
  type: "table-col-header";
  meta: {
    i_col: number | undefined;
    label: string;
    isGroupHeader: boolean;
    i_colGroup?: number;
  };
  backgroundColor: ColorKeyOrString | "none";
  mText?: MeasuredText;
  textPosition?: Coordinates;
  textAlignH: "left" | "center" | "right";
  textAlignV: "top" | "middle" | "bottom";
};

export type TableBorderPrimitive = BasePrimitive & {
  type: "table-border";
  meta: Record<PropertyKey, never>;
  horizontalLines: { y: number; x1: number; x2: number }[];
  verticalLines: { x: number; y1: number; y2: number }[];
  style: {
    strokeColor: ColorKeyOrString;
    strokeWidth: number;
  };
};

export type TableGridPrimitive = BasePrimitive & {
  type: "table-grid";
  meta: Record<PropertyKey, never>;
  horizontalLines: { y: number; x1: number; x2: number }[];
  verticalLines: { x: number; y1: number; y2: number }[];
  style: {
    strokeColor: ColorKeyOrString;
    strokeWidth: number;
  };
};

export type TableHeaderAxisPrimitive = BasePrimitive & {
  type: "table-header-axis";
  meta: Record<PropertyKey, never>;
  horizontalLines: { y: number; x1: number; x2: number }[];
  verticalLines: { x: number; y1: number; y2: number }[];
  style: {
    strokeColor: ColorKeyOrString;
    strokeWidth: number;
  };
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Annotation Primitives                                                   //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type AnnotationRectPrimitive = BasePrimitive & {
  type: "annotation-rect";
  meta: { group: string };
  style: RectStyle;
  text?: {
    mText: MeasuredText;
    position: Coordinates;
    alignH: "left" | "center" | "right";
    alignV: "top" | "middle" | "bottom";
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
  | ChartConfidenceBandPrimitive
  // Chart structure (coarse-grained)
  | ChartAxisPrimitive
  | ChartGridPrimitive
  | ChartLegendPrimitive
  | ChartCaptionPrimitive
  | ChartLabelPrimitive
  // SimpleViz primitives
  | BoxPrimitive
  | ArrowPrimitive
  // Sankey primitives
  | SankeyNodePrimitive
  | SankeyLinkPrimitive
  // Cascade primitives
  | CascadeArrowPrimitive
  // Map primitives
  | MapRegionPrimitive
  | MapLabelPrimitive
  // Scale legend primitives
  | ScaleLegendGradientPrimitive
  | ScaleLegendSteppedPrimitive
  // Table primitives
  | TableCellPrimitive
  | TableRowHeaderPrimitive
  | TableColHeaderPrimitive
  | TableBorderPrimitive
  | TableGridPrimitive
  | TableHeaderAxisPrimitive
  // Annotation primitives
  | AnnotationRectPrimitive;
