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

export function renderNoise(
  rc: RenderContext,
  bounds: RectCoordsDims,
  baseHex: string,
  scale: number,
  contrast: number,
  random: () => number,
): void {
  const patternColor = derivePatternColor(baseHex, contrast);
  const w = bounds.w();
  const h = bounds.h();
  const x = bounds.x();
  const y = bounds.y();

  const dotSize = 4 * scale;
  const density = 0.002 / (scale * scale);
  const count = Math.floor(w * h * density);

  for (let i = 0; i < count; i++) {
    const px = x + random() * w;
    const py = y + random() * h;
    const size = dotSize * (0.5 + random());

    const segments = circleToPath(px, py, size);
    rc.rPath(segments, {
      fill: { color: patternColor },
    });
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
