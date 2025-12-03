// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorAdjustmentStrategy,
  ColorKeyOrString,
  CoordinatesOptions,
  Dimensions,
  RectCoordsDimsOptions,
  TextInfoUnkeyed,
} from "./deps.ts";

export type MeasuredText = {
  lines: MeasuredTextLine[];
  dims: Dimensions;
  ti: TextInfoUnkeyed;
  rotation: "horizontal" | "anticlockwise" | "clockwise";
};

export type MeasuredTextLine = {
  text: string;
  w: number;
  y: number;
};

export type LineStyle = {
  show?: boolean;
  strokeWidth: number;
  strokeColor: ColorKeyOrString;
  lineDash: "solid" | "dashed";
};

export type RectStyle = {
  show?: boolean;
  fillColor: ColorKeyOrString;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
};

export type AreaStyle = {
  show?: boolean;
  to: "zero-line" | "previous-series-or-zero" | "previous-series-or-skip";
  fillColor: ColorKeyOrString;
  fillColorAdjustmentStrategy: ColorAdjustmentStrategy;
};

export const _POINT_TYPES: PointType[] = [
  "circle",
  "crossRot",
  "rectRot",
  "cross",
  "rect",
  "triangle",
];

export type PointType =
  | "circle"
  | "crossRot"
  | "rectRot"
  | "cross"
  | "rect"
  | "triangle";

export type PointStyle = {
  show?: boolean;
  pointStyle: PointType;
  radius: number;
  color: ColorKeyOrString;
  strokeWidth: number;
  innerColorStrategy: ColorAdjustmentStrategy;
  dataLabelPosition: "top" | "left" | "bottom" | "right";
};

export type RenderContext = {
  mText: (
    text: string,
    ti: TextInfoUnkeyed,
    maxWidth: number,
    opts?: {
      rotation?: "horizontal" | "anticlockwise" | "clockwise";
    },
  ) => MeasuredText;

  rText: {
    (
      mText: MeasuredText,
      bounds: RectCoordsDimsOptions,
      hAlign: "center" | "left" | "right",
      vAlign?: "top" | "center" | "bottom",
    ): void;
    (
      mText: MeasuredText,
      coords: CoordinatesOptions,
      hAlign: "center" | "left" | "right",
      vAlign?: "top" | "center" | "bottom",
    ): void;
  };

  rLine: (coordArray: CoordinatesOptions[], s: LineStyle) => void;

  rArea: (coordArray: CoordinatesOptions[], s: AreaStyle) => void;

  rRect: (rcd: RectCoordsDimsOptions, s: RectStyle) => void;

  rPoint: (coords: CoordinatesOptions, s: PointStyle) => void;

  rImage: {
    (
      image: HTMLImageElement | HTMLCanvasElement,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ): void;
    (
      image: HTMLImageElement | HTMLCanvasElement,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ): void;
  };
};
