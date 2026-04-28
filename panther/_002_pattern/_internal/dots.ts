// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../deps.ts";
import type {
  PathSegment,
  RenderContext,
} from "../../_001_render_system/mod.ts";
import { derivePatternColor } from "../color_utils.ts";

export function renderDots(
  rc: RenderContext,
  bounds: RectCoordsDims,
  baseHex: string,
  scale: number,
  contrast: number,
): void {
  const patternColor = derivePatternColor(baseHex, contrast);
  const w = bounds.w();
  const h = bounds.h();
  const x = bounds.x();
  const y = bounds.y();

  const dotRadius = 6 * scale;
  const spacing = 40 * scale;

  const offsetX = (w % spacing) / 2;
  const offsetY = (h % spacing) / 2;

  for (let px = x + offsetX; px < x + w; px += spacing) {
    for (let py = y + offsetY; py < y + h; py += spacing) {
      const segments = circleToPath(px, py, dotRadius);
      rc.rPath(segments, {
        fill: { color: patternColor },
      });
    }
  }
}

function circleToPath(cx: number, cy: number, r: number): PathSegment[] {
  const k = 0.5522847498;
  const kr = k * r;

  return [
    { type: "moveTo", x: cx - r, y: cy },
    {
      type: "bezierCurveTo",
      cp1x: cx - r,
      cp1y: cy - kr,
      cp2x: cx - kr,
      cp2y: cy - r,
      x: cx,
      y: cy - r,
    },
    {
      type: "bezierCurveTo",
      cp1x: cx + kr,
      cp1y: cy - r,
      cp2x: cx + r,
      cp2y: cy - kr,
      x: cx + r,
      y: cy,
    },
    {
      type: "bezierCurveTo",
      cp1x: cx + r,
      cp1y: cy + kr,
      cp2x: cx + kr,
      cp2y: cy + r,
      x: cx,
      y: cy + r,
    },
    {
      type: "bezierCurveTo",
      cp1x: cx - kr,
      cp1y: cy + r,
      cp2x: cx - r,
      cp2y: cy + kr,
      x: cx - r,
      y: cy,
    },
  ];
}
