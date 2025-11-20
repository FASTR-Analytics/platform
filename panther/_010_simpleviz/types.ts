// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AnchorPoint,
  ColorKeyOrString,
  CoordinatesOptions,
  CustomFigureStyle,
  CustomStyleTextOptions,
  FigureInputsBase,
  LineStyle,
  Measured,
  MeasuredSurrounds,
  PaddingOptions,
  Primitive,
} from "./deps.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Input Types                                                             //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type SimpleVizInputs = FigureInputsBase & {
  simpleVizData: SimpleVizData;
};

export type SimpleVizData = {
  boxes: RawBox[];
  arrows: RawArrow[];
  layerPlacementOrder: number[][]; // Array of placement sequences. Within each sequence: first element is source layer (manual placement), rest align to layers in same sequence
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Raw Box Type                                                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type RawBox = {
  id: string;
  // Layer/order system with alignment
  layer?: number; // Vertical layer (row) - y coordinate calculated as: startY + (layer * layerGap)
  order?: number; // Horizontal order within layer. Boxes with same order number are grouped and centered together at target position
  leftOffset?: number; // Additional left margin (source layer: always applied; aligned layers: only for unconnected boxes)
  alignToRightEdge?: boolean; // If true and box is unconnected, align right edge to available width boundary (overrides leftOffset)
  subtreeDepth?: number; // Max depth to traverse when calculating subtree center (tree-aware mode). undefined = unlimited depth
  // Explicit coordinates (fallback if layer not specified)
  x?: number;
  y?: number;
  width?: number; // Fixed width (before style.scale). If specified without height, height auto-sizes from text wrapped to this width.
  height?: number; // Fixed height (before style.scale). Must be paired with width - height-only is not supported.
  anchor?: AnchorPoint;
  padding?: PaddingOptions;
  text?: string | string[];
  secondaryText?: string | string[];
  // Visual style overrides
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  textHorizontalAlign?: "left" | "center" | "right";
  textVerticalAlign?: "top" | "center" | "bottom";
  textGap?: number;
  // Text style overrides
  primaryTextStyle?: CustomStyleTextOptions;
  secondaryTextStyle?: CustomStyleTextOptions;
  // Arrow connection points
  arrowStartPoint?: AnchorPoint;
  arrowEndPoint?: AnchorPoint;
  // Rendering order control
  zIndex?: number; // Controls rendering order (higher renders on top). Defaults to Z_INDEX.SIMPLEVIZ_BOX (500)
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Raw Arrow Type                                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// Arrow with explicit points
export type RawArrowWithPoints = {
  type: "points";
  id: string;
  points: CoordinatesOptions[];
  startArrow?: boolean;
  endArrow?: boolean;
  arrowheadSize?: number;
  style?: LineStyle;
  zIndex?: number; // Controls rendering order (higher renders on top). Defaults to Z_INDEX.SIMPLEVIZ_ARROW (490)
  ignoreDuringPlacement?: boolean; // If true, this arrow is not considered during box placement calculations
};

// Arrow connecting two boxes (always has end arrow, no start arrow)
export type RawArrowWithBoxIDs = {
  type: "box-ids";
  id: string;
  fromBoxID: string;
  toBoxID: string;
  arrowheadSize?: number;
  truncateStart?: number; // Gap in pixels from fromBox edge (default: 0)
  truncateEnd?: number; // Gap in pixels from toBox edge (default: 0)
  arrowStartPoint?: AnchorPoint; // Override anchor point for arrow start (overrides box and default)
  arrowEndPoint?: AnchorPoint; // Override anchor point for arrow end (overrides box and default)
  style?: LineStyle;
  zIndex?: number; // Controls rendering order (higher renders on top). Defaults to Z_INDEX.SIMPLEVIZ_ARROW (490)
  ignoreDuringPlacement?: boolean; // If true, this arrow is not considered during box placement calculations
};

export type RawArrow = RawArrowWithPoints | RawArrowWithBoxIDs;

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Measured Type                                                           //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type MeasuredSimpleViz = Measured<SimpleVizInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  customFigureStyle: CustomFigureStyle;
  transformedData: SimpleVizData;
  primitives: Primitive[];
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
};
