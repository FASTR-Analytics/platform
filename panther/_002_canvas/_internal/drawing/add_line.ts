// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type CoordinatesOptions,
  getColor,
  type LineStyle,
} from "../../deps.ts";

export function addLine(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  coordArray: CoordinatesOptions[],
  s: LineStyle,
) {
  if (s.show === false) {
    return;
  }
  if (coordArray.length < 2) {
    return;
  }
  ctx.strokeStyle = getColor(s.strokeColor);
  ctx.lineWidth = s.strokeWidth;
  ctx.lineJoin = "round";
  if (s.lineDash === "dashed") {
    ctx.setLineDash([s.strokeWidth * 5, s.strokeWidth * 4]);
  } else {
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  const p1 = new Coordinates(coordArray.at(0)!);
  ctx.moveTo(p1.x(), p1.y());
  for (const p of coordArray.slice(1)) {
    const pN = new Coordinates(p);
    ctx.lineTo(pN.x(), pN.y());
  }
  ctx.stroke();

  // Safety measure
  ctx.setLineDash([]);
}
