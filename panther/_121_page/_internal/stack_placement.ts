// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AlignH, AlignV, RectCoordsDims } from "../deps.ts";

export function getTextX(
  paddedBounds: RectCoordsDims,
  alignH: AlignH,
): number {
  switch (alignH) {
    case "left":
      return paddedBounds.x();
    case "right":
      return paddedBounds.rightX();
    case "center":
      return paddedBounds.centerX();
  }
}

export function getStartY(
  paddedBounds: RectCoordsDims,
  alignV: AlignV,
  totalH: number,
): number {
  switch (alignV) {
    case "top":
      return paddedBounds.y();
    case "bottom":
      return paddedBounds.bottomY() - totalH;
    case "middle":
      return paddedBounds.centerY() - totalH / 2;
  }
}
