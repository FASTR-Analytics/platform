// Copyright 2023-2026, Tim Roberton. MIT license.
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
  LabelHalo,
  MeasuredText,
  PrimitiveItem,
} from "../deps.ts";
import { Coordinates, RectCoordsDims } from "../deps.ts";

export type Orientation = "vertical" | "horizontal";

// Extract the value-axis coordinate from a mapped Coordinates object.
// Vertical: value lives on Y. Horizontal: value lives on X.
export function valueCoord(c: Coordinates, orientation: Orientation): number {
  return orientation === "horizontal" ? c.x() : c.y();
}

// Extract the category-axis coordinate from a mapped Coordinates object.
// (Inverse of valueCoord.)
export function catCoord(c: Coordinates, orientation: Orientation): number {
  return orientation === "horizontal" ? c.y() : c.x();
}

// Screen coordinate of the value-axis baseline (the valueMin grid line).
// Vertical: bottom edge of sub-chart minus the start-side overhang clearance
// (positive values grow upward). Horizontal: left edge plus the clearance
// (positive values grow rightward). Must stay consistent with
// calculateMappedCoordinates and getValueAxisTickPositions.
// Pure — callers apply the half-grid-stroke fudge themselves where they need
// a bar edge to extend past the baseline to mask the baseline grid line:
//   valueStart = valueBaseline - valueExtendDir * gridLineStrokeWidth / 2
export function valueBaselineCoord(
  subChartRcd: RectCoordsDims,
  orientation: Orientation,
  valueClearanceStart: number,
): number {
  return orientation === "horizontal"
    ? subChartRcd.x() + valueClearanceStart
    : subChartRcd.bottomY() - valueClearanceStart;
}

// Direction a positive value extends from the baseline.
// Vertical: Y decreases as value increases (bar grows upward) → -1.
// Horizontal: X increases as value increases (bar grows rightward) → +1.
export function valueExtendDir(orientation: Orientation): 1 | -1 {
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
// - valueStart / valueEnd: two points on the value axis; the bar spans between
//   them regardless of which is closer to the baseline (handles stacking /
//   diff modes where either end may be "first").
export function makeBarRect(
  p: {
    catStart: number;
    catExtent: number;
    valueStart: number;
    valueEnd: number;
  },
  orientation: Orientation,
): RectCoordsDims {
  const valueMin = Math.min(p.valueStart, p.valueEnd);
  const valueSpan = Math.abs(p.valueEnd - p.valueStart);
  if (orientation === "horizontal") {
    return new RectCoordsDims({
      x: valueMin,
      y: p.catStart,
      w: valueSpan,
      h: p.catExtent,
    });
  }
  return new RectCoordsDims({
    x: p.catStart,
    y: valueMin,
    w: p.catExtent,
    h: valueSpan,
  });
}

// Emit a chart-error-bar primitive. Given logical (categoryCenter, valueUb,
// valueLb, capExtent) the helper routes to the correct orientation variant of
// the discriminated union.
export function makeErrorBarPrimitive(params: {
  key: string;
  item: PrimitiveItem | undefined;
  meta: { value: ChartValueInfo };
  categoryCenter: number;
  valueUb: number;
  valueLb: number;
  capExtent: number;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  zIndex: number;
  orientation: Orientation;
}): ChartErrorBarPrimitive {
  const valueMin = Math.min(params.valueUb, params.valueLb);
  const valueSpan = Math.abs(params.valueUb - params.valueLb);
  const bounds = params.orientation === "horizontal"
    ? new RectCoordsDims({
      x: valueMin,
      y: params.categoryCenter - params.capExtent / 2,
      w: valueSpan,
      h: params.capExtent,
    })
    : new RectCoordsDims({
      x: params.categoryCenter - params.capExtent / 2,
      y: valueMin,
      w: params.capExtent,
      h: valueSpan,
    });
  const common = {
    type: "chart-error-bar" as const,
    key: params.key,
    item: params.item,
    part: "marker" as const,
    bounds,
    hitBounds: bounds,
    zIndex: params.zIndex,
    meta: params.meta,
    strokeColor: params.strokeColor,
    strokeWidth: params.strokeWidth,
    capWidth: params.capExtent,
  };
  if (params.orientation === "horizontal") {
    return {
      ...common,
      orientation: "horizontal",
      centerY: params.categoryCenter,
      ubX: params.valueUb,
      lbX: params.valueLb,
    };
  }
  return {
    ...common,
    orientation: "vertical",
    centerX: params.categoryCenter,
    ubY: params.valueUb,
    lbY: params.valueLb,
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
  halo: LabelHalo | undefined;
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
      halo: params.halo,
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
    halo: params.halo,
  };
}
