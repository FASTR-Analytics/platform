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
  PrimitiveItem,
} from "../deps.ts";
import { Coordinates, Padding, RectCoordsDims } from "../deps.ts";
import {
  dataLabelBox,
  type ResolvedDataLabel,
} from "./content_generation_types.ts";

export type Orientation = "vertical" | "horizontal";

export type ValueAxisSide = "start" | "end";

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

// Direction a positive value extends from the zero line.
// Vertical: Y decreases as value increases (bar grows upward) → -1.
// Horizontal: X increases as value increases (bar grows rightward) → +1.
export function valueExtendDir(orientation: Orientation): 1 | -1 {
  return orientation === "horizontal" ? 1 : -1;
}

export function withValueCoord(
  c: Coordinates,
  value: number,
  orientation: Orientation,
): Coordinates {
  return orientation === "horizontal"
    ? new Coordinates([value, c.y()])
    : new Coordinates([c.x(), value]);
}

export function withValueExtentOf(
  rect: RectCoordsDims,
  from: RectCoordsDims,
  orientation: Orientation,
): RectCoordsDims {
  return orientation === "horizontal"
    ? new RectCoordsDims({ x: from.x(), y: rect.y(), w: from.w(), h: rect.h() })
    : new RectCoordsDims({
      x: rect.x(),
      y: from.y(),
      w: rect.w(),
      h: from.h(),
    });
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

export function valueAxisExtentOfRect(
  rect: RectCoordsDims,
  orientation: Orientation,
): number {
  return orientation === "horizontal" ? rect.w() : rect.h();
}

// Center of a rect along the category axis.
export function catCenterOfRect(
  rect: RectCoordsDims,
  orientation: Orientation,
): number {
  return orientation === "horizontal" ? rect.centerY() : rect.centerX();
}

export function sideEdgeCenterOfRect(
  rect: RectCoordsDims,
  side: ValueAxisSide,
  orientation: Orientation,
): Coordinates {
  return orientation === "horizontal"
    ? new Coordinates([
      side === "end" ? rect.rightX() : rect.x(),
      rect.centerY(),
    ])
    : new Coordinates([
      rect.centerX(),
      side === "end" ? rect.y() : rect.bottomY(),
    ]);
}

// Build a bar rectangle from logical extents.
// - catStart / catExtent: position/extent along the category axis (series slot).
// - valueStart / valueEnd: two points on the value axis; the bar spans between
//   them whichever lies toward the end side (a bar drawn toward the start
//   side, or a diff bar whose value is below the previous series').
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

// A centre label is drawn only where its box fits its bar with its offset
// clear of each end of the bar along the value axis, where the next segment
// of a stack or the bar's own end begins.
export function makeBarCenterDataLabel(
  label: ResolvedDataLabel,
  barRcd: RectCoordsDims,
  orientation: Orientation,
): DataLabel | undefined {
  const place = {
    position: barRcd.centerCoords(),
    alignH: "center",
    alignV: "middle",
  } as const;
  const box = dataLabelBox(label, place);
  const room = barRcd.getPadded(
    new Padding(
      orientation === "horizontal" ? { x: label.offset } : { y: label.offset },
    ),
  );
  const fits = box.x() >= room.x() && box.rightX() <= room.rightX() &&
    box.y() >= room.y() && box.bottomY() <= room.bottomY();
  return fits ? { mText: label.mText, ...place, halo: label.halo } : undefined;
}

// `anchor` is the mark's value end: the middle of a bar's edge at its value
// end, or a line's point. The label stands past it on `side`.
export function makeValueEndDataLabel(
  label: ResolvedDataLabel,
  anchor: Coordinates,
  side: ValueAxisSide,
  orientation: Orientation,
): DataLabel {
  const offset = valueExtendDir(orientation) *
    (side === "end" ? label.offset : -label.offset);
  return orientation === "horizontal"
    ? {
      mText: label.mText,
      position: new Coordinates([anchor.x() + offset, anchor.y()]),
      alignH: side === "end" ? "left" : "right",
      alignV: "middle",
      halo: label.halo,
    }
    : {
      mText: label.mText,
      position: new Coordinates([anchor.x(), anchor.y() + offset]),
      alignH: "center",
      alignV: side === "end" ? "bottom" : "top",
      halo: label.halo,
    };
}
