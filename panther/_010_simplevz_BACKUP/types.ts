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
};

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Raw Box Type                                                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export type RawBox = {
  id: string;
  // Layout method 1: Layer/order system (automatic grid)
  layer?: number; // Vertical layer (row) - y coordinate calculated as: startY + (layer * layerGap)
  order?: number; // Horizontal order within layer - determines left-to-right positioning
  leftOffset?: number; // Additional left margin for manual grouping (applied before layer alignment)
  // Layout method 2: Explicit coordinates (fallback if layer not specified)
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
  style?: LineStyle;
  zIndex?: number; // Controls rendering order (higher renders on top). Defaults to Z_INDEX.SIMPLEVIZ_ARROW (490)
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
