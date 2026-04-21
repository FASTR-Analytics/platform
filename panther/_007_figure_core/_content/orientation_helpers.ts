// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Small helpers that localise orientation-dependent geometry to one place.
// Content primitive generators should express their math in logical
// (category-axis, value-axis) terms and use these helpers to project to
// screen coordinates.

import type {
  ChartErrorBarPrimitive,
  ChartValueInfo,
  ColorKeyOrString,
  DataLabel,
  MeasuredText,
} from "../deps.ts";
import { Coordinates, RectCoordsDims } from "../deps.ts";

export type Orientation = "vertical" | "horizontal";

// Extract the value-axis coordinate from a mapped Coordinates object.
// Vertical: value lives on Y. Horizontal: value lives on X.
export function valCoord(c: Coordinates, orientation: Orientation): number {
  return orientation === "horizontal" ? c.x() : c.y();
}

// Extract the category-axis coordinate from a mapped Coordinates object.
// (Inverse of valCoord.)
export function catCoord(c: Coordinates, orientation: Orientation): number {
  return orientation === "horizontal" ? c.y() : c.x();
}

// Screen coordinate of the zero-line (value=0 baseline).
// Vertical: bottom edge of plot area (positive values grow upward).
// Horizontal: left edge of plot area (positive values grow rightward).
// Pure — callers apply the half-grid-stroke fudge themselves where they need
// a bar edge to extend past the baseline to mask the baseline grid line:
//   valStart = valBaseline - valExtendDir * gridStrokeWidth / 2
export function valBaselineCoord(
  subChartRcd: RectCoordsDims,
  orientation: Orientation,
): number {
  return orientation === "horizontal" ? subChartRcd.x() : subChartRcd.bottomY();
}

// Direction a positive value extends from the baseline.
// Vertical: Y decreases as value increases (bar grows upward) → -1.
// Horizontal: X increases as value increases (bar grows rightward) → +1.
export function valExtendDir(orientation: Orientation): 1 | -1 {
  return orientation === "horizontal" ? 1 : -1;
}

// Extent of a rect along the category axis.
// Vertical: width (bars stand side-by-side horizontally).
// Horizontal: height (bars stack vertically).
export function catExtentOfRect(
  rect: RectCoordsDims,
  orientation: Orientation,
): number {
  return orientation === "horizontal" ? rect.h() : rect.w();
}

// Center of a rect along the category axis.
export function catCenterOfRect(
  rect: RectCoordsDims,
  orientation: Orientation,
): number {
  return orientation === "horizontal" ? rect.centerY() : rect.centerX();
}

// Build a bar rectangle from logical extents.
// - catStart / catExtent: position/extent along the category axis (series slot).
// - valStart / valEnd: two points on the value axis; the bar spans between
//   them regardless of which is closer to the baseline (handles stacking /
//   diff modes where either end may be "first").
export function makeBarRect(
  p: {
    catStart: number;
    catExtent: number;
    valStart: number;
    valEnd: number;
  },
  orientation: Orientation,
): RectCoordsDims {
  const valMin = Math.min(p.valStart, p.valEnd);
  const valSpan = Math.abs(p.valEnd - p.valStart);
  if (orientation === "horizontal") {
    return new RectCoordsDims({
      x: valMin,
      y: p.catStart,
      w: valSpan,
      h: p.catExtent,
    });
  }
  return new RectCoordsDims({
    x: p.catStart,
    y: valMin,
    w: p.catExtent,
    h: valSpan,
  });
}

// Emit a chart-error-bar primitive. Given logical (categoryCenter, valUb,
// valLb, capExtent) the helper routes to the correct orientation variant of
// the discriminated union.
export function makeErrorBarPrimitive(params: {
  key: string;
  meta: { value: ChartValueInfo };
  categoryCenter: number;
  valUb: number;
  valLb: number;
  capExtent: number;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  zIndex: number;
  orientation: Orientation;
}): ChartErrorBarPrimitive {
  const valMin = Math.min(params.valUb, params.valLb);
  const valSpan = Math.abs(params.valUb - params.valLb);
  const common = {
    type: "chart-error-bar" as const,
    key: params.key,
    zIndex: params.zIndex,
    meta: params.meta,
    strokeColor: params.strokeColor,
    strokeWidth: params.strokeWidth,
    capWidth: params.capExtent,
  };
  if (params.orientation === "horizontal") {
    return {
      ...common,
      bounds: new RectCoordsDims({
        x: valMin,
        y: params.categoryCenter - params.capExtent / 2,
        w: valSpan,
        h: params.capExtent,
      }),
      orientation: "horizontal",
      centerY: params.categoryCenter,
      ubX: params.valUb,
      lbX: params.valLb,
    };
  }
  return {
    ...common,
    bounds: new RectCoordsDims({
      x: params.categoryCenter - params.capExtent / 2,
      y: valMin,
      w: params.capExtent,
      h: valSpan,
    }),
    orientation: "vertical",
    centerX: params.categoryCenter,
    ubY: params.valUb,
    lbY: params.valLb,
  };
}

// Build a bar's data-label. The label sits past the value-end of the bar
// (above in vertical, to the right in horizontal).
// textMaxWidth: pass barRcd.w() in vertical (labels wrap to bar width) or
// 9999 in horizontal (labels overflow short bars — same treatment as line
// labels).
export function makeBarDataLabel(params: {
  barRcd: RectCoordsDims;
  mText: MeasuredText;
  offset: number;
  style: DataLabel["style"];
  orientation: Orientation;
}): DataLabel {
  if (params.orientation === "horizontal") {
    return {
      mText: params.mText,
      position: new Coordinates([
        params.barRcd.rightX() + params.offset,
        params.barRcd.centerY(),
      ]),
      alignH: "left",
      alignV: "middle",
      style: params.style,
    };
  }
  return {
    mText: params.mText,
    position: new Coordinates([
      params.barRcd.centerX(),
      params.barRcd.y() - params.offset,
    ]),
    alignH: "center",
    alignV: "bottom",
    style: params.style,
  };
}
