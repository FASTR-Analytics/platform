// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "./deps.ts";

const DPI = 96;

export function pixelsToInches(px: number): number {
  return px / DPI;
}

export function pixelsToPoints(px: number): number {
  return (px / DPI) * 72;
}

export type SlidePosition = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function rcdToSlidePosition(rcd: RectCoordsDims): SlidePosition {
  return {
    x: pixelsToInches(rcd.x()),
    y: pixelsToInches(rcd.y()),
    w: pixelsToInches(rcd.w()),
    h: pixelsToInches(rcd.h()),
  };
}
