// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  CoordinatesOptions,
  CustomFigureStyle,
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
  coordinateScale?: number; // Scale applied to box coordinates before auto-fit (default: 1)
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

export type AnchorPoint =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type RawBox = {
  id: string;
  x: number;
  y: number;
  width?: number; // Fixed width (before style.scale). If specified without height, height auto-sizes from text wrapped to this width.
  height?: number; // Fixed height (before style.scale). Must be paired with width - height-only is not supported.
  anchor?: AnchorPoint;
  padding?: PaddingOptions;
  text?: string | string[];
  secondaryText?: string | string[];
  fillColor?: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  textHorizontalAlign?: "left" | "center" | "right";
  textVerticalAlign?: "top" | "center" | "bottom";
  textGap?: number;
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
