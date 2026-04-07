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
  const x = rcd.x();
  const y = rcd.y();
  const w = rcd.w();
  const h = rcd.h();
  const r = s.rectRadius ?? 0;

  if (r > 0) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = getColor(s.fillColor);
    ctx.fill();
    if (s.strokeColor && s.strokeWidth) {
      ctx.strokeStyle = getColor(s.strokeColor);
      ctx.lineWidth = s.strokeWidth;
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = getColor(s.fillColor);
    ctx.fillRect(x, y, w, h);
    if (s.strokeColor && s.strokeWidth) {
      ctx.strokeStyle = getColor(s.strokeColor);
      ctx.lineWidth = s.strokeWidth;
      ctx.strokeRect(x, y, w, h);
    }
  }
}
