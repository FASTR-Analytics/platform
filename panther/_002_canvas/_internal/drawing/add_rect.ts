// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getColor, type RectCoordsDims, type RectStyle } from "../../deps.ts";

export function addRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rcd: RectCoordsDims,
  s: RectStyle,
) {
  if (s.show === false) {
    return;
  }
  ctx.fillStyle = getColor(s.fillColor);
  ctx.fillRect(rcd.x(), rcd.y(), rcd.w(), rcd.h());

  if (s.strokeColor && s.strokeWidth) {
    ctx.strokeStyle = getColor(s.strokeColor);
    ctx.lineWidth = s.strokeWidth;
    ctx.strokeRect(rcd.x(), rcd.y(), rcd.w(), rcd.h());
  }
}
