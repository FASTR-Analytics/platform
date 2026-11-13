// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  ChartConnectorInfo,
  ChartSeriesInfo,
  ChartValueInfo,
  ColorAdjustmentStrategy,
  ColorKeyOrString,
  Coordinates,
  DimensionMember,
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
import type { PrimitiveItem, PrimitivePart } from "./identity.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Shared Types                                                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type Arrowhead = {
  position: Coordinates;
  angle: number;
  size: number;
};

export const Z_INDEX = {
  BACKGROUND: 0,
  GRID: 100,
  AXIS: 200,
  CONTENT_AREA: 300,
  CONTENT_LINE: 400,
  CONTENT_BAR: 500,
  CONTENT_CONNECTOR: 550,
  CONTENT_POINT: 600,
  LABEL: 700,
  LEGEND: 800,
  FIGURE_TEXT: 900,
  // Cascade defaults
  CASCADE_ARROW: 550,
  // Map defaults
  MAP_REGION: 300,
  // Pie defaults
  PIE_SLICE: 300,
  // Figure labels (map areas, pie slices) — above all figure content
  FIGURE_LABEL: 750,
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
  // Scene defaults: regions behind connectors behind elements
  SCENE_REGION: 470,
  SCENE_CONNECTOR: 490,
  SCENE_ELEMENT: 500,
} as const;

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Base Primitive Type                                                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type BasePrimitive = {
  type: string;
  key: string;
  // What the primitive stands for, absent when it stands for no data member.
  item?: PrimitiveItem;
  bounds: RectCoordsDims;
  zIndex?: number;
  // A group alpha: the primitive composites over what is beneath it at this
  // alpha (RenderContext.withOpacity). Consecutive primitives sharing a
  // `group` and an `opacity` composite as one layer, so a scene element's
  // text is not tinted by its own fill.
  opacity?: number;
  group?: string;
  annotationGroup?: string;
  annotationBounds?: RectCoordsDims;
};

// A primitive with a part stands for a thing and reports it where it is hit:
// at hitBounds, which may differ from the rect it paints.
export type Hittable<P extends PrimitivePart> = {
  part: P;
  hitBounds: RectCoordsDims;
};

// A decoration has no part, so it is never hit.
export type Decoration = {
  part?: never;
  hitBounds?: never;
};

// Data inside one primitive that stands for its own thing (a legend's entry,
// an axis's tick) carries an identity of its own, or none.
export type NestedIdentity =
  | { item: PrimitiveItem; part: "header"; hitBounds: RectCoordsDims }
  | { item?: never; part?: never; hitBounds?: never };

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart-Specific Metadata Types                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// NOTE: These are chart domain concepts but must live in _001_render_system
// because chart primitives (ChartDataPoint, ChartBar, etc.) reference them.
// Since _007_figure_core imports from _001_render_system, the dependency
// hierarchy prevents these types from living in _007_figure_core.

export type LabelHalo = {
  fillColor?: ColorKeyOrString;
  borderColor?: ColorKeyOrString;
  borderWidth?: number;
  padding: Padding;
  rectRadius?: number;
};

export type DataLabel = {
  mText: MeasuredText;
  position: Coordinates;
  alignH: "left" | "center" | "right";
  alignV: "top" | "middle" | "bottom";
  halo?: LabelHalo;
};

export type BarStackingMode = "stacked" | "imposed" | "diff" | "grouped";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart Content Primitives (Fine-Grained, Animatable)                     //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type ChartDataPointPrimitive =
  & BasePrimitive
  & Hittable<"marker">
  & {
    type: "chart-data-point";
    meta: {
      value: ChartValueInfo;
    };
    // Visual
    coords: Coordinates;
    style: PointStyle;
    dataLabel?: DataLabel;
  };

export type ChartLineSeriesPrimitive =
  & BasePrimitive
  & Hittable<"body">
  & {
    type: "chart-line-series";
    meta: {
      series: ChartSeriesInfo;
      valueIndices: number[]; // Parallel to coords/values
    };
    // Visual
    coords: Coordinates[];
    style: LineStyle;
    pointLabels?: Array<{
      coordIndex: number;
      dataLabel: DataLabel;
    }>;
  };

export type ChartAreaSeriesPrimitive =
  & BasePrimitive
  & Hittable<"body">
  & {
    type: "chart-area-series";
    meta: {
      series: ChartSeriesInfo;
      valueIndices: number[];
    };
    // Visual
    coords: Coordinates[];
    style: AreaStyle;
  };

export type ChartConnectorPrimitive =
  & BasePrimitive
  & Hittable<"link">
  & {
    type: "chart-connector";
    meta: {
      connector: ChartConnectorInfo;
    };
    // Visual
    coords: Coordinates[]; // ≥2, in series order
    style: LineStyle;
    arrowheads?: {
      start?: Arrowhead;
      end?: Arrowhead;
    };
  };

export type ChartBarPrimitive =
  & BasePrimitive
  & Hittable<"body">
  & {
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
  };

export type ChartErrorBarPrimitive =
  & BasePrimitive
  & Hittable<"marker">
  & {
    type: "chart-error-bar";
    meta: {
      value: ChartValueInfo;
    };
    strokeColor: ColorKeyOrString;
    strokeWidth: number;
    capWidth: number;
  }
  & (
    | { orientation: "vertical"; centerX: number; ubY: number; lbY: number }
    | { orientation: "horizontal"; centerY: number; ubX: number; lbX: number }
  );

export type ChartErrorBandPrimitive =
  & BasePrimitive
  & Hittable<"body">
  & {
    type: "chart-error-band";
    meta: {
      series: ChartSeriesInfo;
    };
    coords: Coordinates[];
    style: {
      fillColor: ColorKeyOrString;
      fillColorAdjustmentStrategy: ColorAdjustmentStrategy;
    };
  };

export type ChartCascadeArrowPrimitive =
  & BasePrimitive
  & Hittable<"link">
  & {
    type: "chart-cascade-arrow";
    meta: {
      from: ChartValueInfo;
      to: ChartValueInfo;
      relRetention: number;
    };
    pathSegments: PathSegment[];
    pathStyle: PathStyle;
    arrowhead?: Arrowhead;
    dataLabel?: DataLabel;
  };

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Chart Structural Primitives (Coarse-Grained)                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type ChartAxisPrimitive =
  & BasePrimitive
  & Decoration
  & {
    type: "chart-axis";
    meta: {
      axisType: "x-text" | "x-period" | "x-value" | "y-value" | "y-text";
      i_pane: number;
      // An x-axis serves one lane and every tier; a y-axis one tier and every
      // lane.
      i_tier?: number;
      i_lane?: number;
      paneMember?: DimensionMember;
      tierMember?: DimensionMember;
      laneMember?: DimensionMember;
    };
    // Pure data - fully serializable. A tick whose label names one indicator
    // or one period carries that member's identity.
    ticks: Array<
      & NestedIdentity
      & {
        position: Coordinates;
        tickLine?: { start: Coordinates; end: Coordinates };
        label?: {
          mText: MeasuredText;
          position: Coordinates;
          alignH: AlignH;
          alignV: AlignV;
        };
        value: number | string | DimensionMember;
      }
    >;
    axisLine: { coords: Coordinates[]; style: LineStyle };
    tickStyle: LineStyle;
    axisLabel?: {
      mText: MeasuredText;
      position: Coordinates;
      alignH: AlignH;
      alignV: AlignV;
    };
  };

export type ChartGridPrimitive =
  & BasePrimitive
  & Decoration
  & {
    type: "chart-grid";
    meta: {
      i_pane: number;
      i_tier: number;
      i_lane: number;
      paneMember?: DimensionMember;
      tierMember?: DimensionMember;
      laneMember?: DimensionMember;
    };
    horizontalLines: { y: number; tickValue?: number }[];
    verticalLines: { x: number; tickValue?: number }[];
    style: {
      show: boolean;
      strokeColor: string;
      strokeWidth: number;
      backgroundColor: string | "none";
    };
  };

export type ChartHeaderPrimitive =
  & BasePrimitive
  & Hittable<"header">
  & {
    type: "chart-header";
    meta: {
      headerType: "pane" | "tier" | "lane" | "indicator";
      i_pane: number;
      i_tier?: number; // Only for tier and indicator headers
      i_lane?: number; // Only for lane and indicator headers
      i_indicator?: number; // Only for indicator headers
      paneMember?: DimensionMember;
      tierMember?: DimensionMember;
      laneMember?: DimensionMember;
      indicatorMember?: DimensionMember;
    };
    mText: MeasuredText;
    // The align rect; bounds is the painted text box.
    alignRcd: RectCoordsDims;
    alignH: AlignH;
    alignV: AlignV;
  };

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Sankey Primitives                                                       //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type SankeyNodePrimitive =
  & BasePrimitive
  & Hittable<"body">
  & {
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

export type SankeyLinkPrimitive =
  & BasePrimitive
  & Hittable<"link">
  & {
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
//    Map Primitives                                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type MapAreaPrimitive =
  & BasePrimitive
  & Hittable<"body">
  & {
    type: "map-area";
    meta: {
      featureId: string;
      i_pane: number;
      i_tier: number;
      i_lane: number;
      paneMember?: DimensionMember;
      tierMember?: DimensionMember;
      laneMember?: DimensionMember;
      value?: number;
    };
    pathSegments: PathSegment[];
    pathStyle: PathStyle;
  };

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Pie Primitives                                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// The geometric params are kept alongside the path so later consumers (gauges,
// hit-testing, pies-on-maps) can reuse the primitive without re-deriving the
// wedge from its bezier approximation.
// A remainder slice stands for no series, so it has no identity.
export type PieSlicePrimitive =
  & BasePrimitive
  & (Hittable<"body"> | Decoration)
  & {
    type: "pie-slice";
    meta: {
      seriesMember: DimensionMember | undefined;
      i_pane: number;
      i_tier: number;
      i_lane: number;
      i_indicator: number;
      paneMember?: DimensionMember;
      tierMember?: DimensionMember;
      laneMember?: DimensionMember;
      indicatorMember?: DimensionMember;
      value: number;
      share: number;
      isRemainder: boolean;
    };
    cx: number;
    cy: number;
    innerR: number;
    outerR: number;
    startAngle: number;
    endAngle: number;
    pathSegments: PathSegment[];
    pathStyle: PathStyle;
  };

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Figure Primitives (shared by every figure)                              //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type FigureTextPrimitive =
  & BasePrimitive
  & Hittable<"label">
  & {
    type: "figure-text";
    meta: {
      textType: "title" | "subtitle" | "footnote";
      i_pane?: number; // A figure text can be figure-level (no pane) or pane-level
    };
    mText: MeasuredText;
    // The align rect; bounds is the painted text box.
    alignRcd: RectCoordsDims;
    alignH: AlignH;
    alignV: AlignV;
  };

export type FigureLegendPrimitive =
  & BasePrimitive
  & Decoration
  & {
    type: "figure-legend";
    meta: {
      i_pane?: number; // Optional - can be figure-level or pane-level
    };
    // Pure data - fully serializable. An entry that names a series carries
    // that series' identity.
    entries: Array<
      & NestedIdentity
      & {
        seriesMember: DimensionMember | undefined;
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
      }
    >;
  };

export type FigureLabelPrimitive =
  & BasePrimitive
  & Hittable<"label" | "value">
  & {
    type: "figure-label";
    meta: {
      id: string;
      i_pane: number;
      i_tier: number;
      i_lane: number;
      // Pie only: which pie in the sub-chart's indicator grid. Absent for map.
      i_indicator?: number;
      paneMember?: DimensionMember;
      tierMember?: DimensionMember;
      laneMember?: DimensionMember;
      indicatorMember?: DimensionMember;
      placement: "inside" | "outside";
    };
    // The rect the label was placed within; bounds is the label box, with its
    // halo's padding, united with its leader line.
    hostRcd: RectCoordsDims;
    mText: MeasuredText;
    position: Coordinates;
    alignH: AlignH;
    alignV: AlignV;
    halo?: LabelHalo;
    leaderLine?: {
      from: Coordinates;
      // Optional elbow: the line runs from → via → to, giving the standard
      // radially-out-then-horizontal callout leader.
      via?: Coordinates;
      to: Coordinates;
      strokeColor: ColorKeyOrString;
      strokeWidth: number;
      gap: number;
    };
  };

export type FigureScaleLegendGradientPrimitive =
  & BasePrimitive
  & Decoration
  & {
    type: "figure-scale-legend-gradient";
    meta: Record<PropertyKey, never>;
    colorStops: { t: number; color: string }[];
    barRect: RectCoordsDims;
    tickLength: number;
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

export type FigureScaleLegendSteppedPrimitive =
  & BasePrimitive
  & Decoration
  & {
    type: "figure-scale-legend-stepped";
    meta: Record<PropertyKey, never>;
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

export type TableCellPrimitive =
  & BasePrimitive
  & Hittable<"body">
  & {
    type: "table-cell";
    meta: {
      i_row: number;
      i_col: number;
      rowMember: DimensionMember | undefined;
      colMember: DimensionMember | undefined;
      rowGroupMember: DimensionMember | undefined;
      colGroupMember: DimensionMember | undefined;
    };
    backgroundColor: ColorKeyOrString | "none";
    mText: MeasuredText;
    // The align rect is the padding-adjusted content box.
    alignRcd: RectCoordsDims;
    alignH: AlignH;
    alignV: AlignV;
  };

export type TableRowHeaderPrimitive =
  & BasePrimitive
  & Hittable<"header">
  & {
    type: "table-row-header";
    meta: {
      i_row: number | "group-header";
      label: string;
      isGroupHeader: boolean;
      member: DimensionMember | undefined;
    };
    backgroundColor: ColorKeyOrString | "none";
    mText: MeasuredText;
    alignRcd: RectCoordsDims;
    alignH: AlignH;
    alignV: AlignV;
  };

export type TableColHeaderPrimitive =
  & BasePrimitive
  & Hittable<"header">
  & {
    type: "table-col-header";
    meta: {
      i_col: number | undefined;
      label: string;
      isGroupHeader: boolean;
      i_colGroup?: number;
      member: DimensionMember | undefined;
    };
    backgroundColor: ColorKeyOrString | "none";
    alignH: AlignH;
    alignV: AlignV;
  }
  & (
    | { mText?: undefined }
    // A group or rotated header's text sits at a point.
    | (
      & { mText: MeasuredText }
      & ({ position: Coordinates } | { alignRcd: RectCoordsDims })
    )
  );

export type TableBorderPrimitive =
  & BasePrimitive
  & Decoration
  & {
    type: "table-border";
    meta: Record<PropertyKey, never>;
    horizontalLines: { y: number; x1: number; x2: number }[];
    verticalLines: { x: number; y1: number; y2: number }[];
    style: {
      strokeColor: ColorKeyOrString;
      strokeWidth: number;
    };
  };

export type TableGridPrimitive =
  & BasePrimitive
  & Decoration
  & {
    type: "table-grid";
    meta: Record<PropertyKey, never>;
    horizontalLines: { y: number; x1: number; x2: number }[];
    verticalLines: { x: number; y1: number; y2: number }[];
    style: {
      strokeColor: ColorKeyOrString;
      strokeWidth: number;
    };
  };

export type TableHeaderBorderPrimitive =
  & BasePrimitive
  & Decoration
  & {
    type: "table-header-border";
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

export type AnnotationRectPrimitive =
  & BasePrimitive
  & Decoration
  & {
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
//    Shape Primitives                                                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// The generic shapes a scene element lowers to. `meta.element` is the key of
// the element the shape belongs to.
type ShapeBase = BasePrimitive & Decoration & {
  item?: never;
  meta: { element: string };
};

export type ShapeRectPrimitive = ShapeBase & {
  type: "shape-rect";
  rcd: RectCoordsDims;
  style: RectStyle;
};

export type ShapeTextPrimitive =
  & ShapeBase
  & {
    type: "shape-text";
    mText: MeasuredText;
    alignH: AlignH;
    alignV: AlignV;
  }
  & ({ position: Coordinates } | { alignRcd: RectCoordsDims });

export type ShapePathPrimitive = ShapeBase & {
  type: "shape-path";
  pathSegments: PathSegment[];
  pathStyle: PathStyle;
  arrowheads?: {
    start?: Arrowhead;
    end?: Arrowhead;
  };
};

export type ShapeImagePrimitive = ShapeBase & {
  type: "shape-image";
  image: HTMLImageElement | HTMLCanvasElement;
  rcd: RectCoordsDims;
};

export type ShapePrimitive =
  | ShapeRectPrimitive
  | ShapeTextPrimitive
  | ShapePathPrimitive
  | ShapeImagePrimitive;

export function isShapePrimitive(p: Primitive): p is ShapePrimitive {
  return p.type === "shape-rect" || p.type === "shape-text" ||
    p.type === "shape-path" || p.type === "shape-image";
}

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
  | ChartConnectorPrimitive
  | ChartBarPrimitive
  | ChartErrorBarPrimitive
  | ChartErrorBandPrimitive
  | ChartCascadeArrowPrimitive
  // Chart structure (coarse-grained)
  | ChartAxisPrimitive
  | ChartGridPrimitive
  | ChartHeaderPrimitive
  // Figure primitives (shared by every figure)
  | FigureTextPrimitive
  | FigureLegendPrimitive
  | FigureScaleLegendGradientPrimitive
  | FigureScaleLegendSteppedPrimitive
  | FigureLabelPrimitive
  // Sankey primitives
  | SankeyNodePrimitive
  | SankeyLinkPrimitive
  // Map primitives
  | MapAreaPrimitive
  // Pie primitives
  | PieSlicePrimitive
  // Table primitives
  | TableCellPrimitive
  | TableRowHeaderPrimitive
  | TableColHeaderPrimitive
  | TableBorderPrimitive
  | TableGridPrimitive
  | TableHeaderBorderPrimitive
  // Annotation primitives
  | AnnotationRectPrimitive
  // Shapes (scene elements lowered)
  | ShapePrimitive;
