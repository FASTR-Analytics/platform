// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AreaStyle,
  Coordinates,
  type CoordinatesOptions,
  getAdjustedColor,
} from "../../deps.ts";

export function addArea(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  coordArray: CoordinatesOptions[],
  s: AreaStyle,
) {
  if (s.show === false) {
    return;
  }
  if (coordArray.length < 2) {
    return;
  }
  ctx.fillStyle = getAdjustedColor(s.fillColor, s.fillColorAdjustmentStrategy);
  ctx.beginPath();
  const p1 = new Coordinates(coordArray.at(0)!);
  ctx.moveTo(p1.x(), p1.y());
  for (const p of coordArray.slice(1)) {
    const pN = new Coordinates(p);
    ctx.lineTo(pN.x(), pN.y());
  }
  ctx.fill();
}
