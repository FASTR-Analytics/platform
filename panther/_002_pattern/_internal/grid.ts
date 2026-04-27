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

export function renderGrid(
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

  const gridSpacing = 80 * scale;
  const lineWidth = 4 * scale;

  for (let px = x; px <= x + w; px += gridSpacing) {
    const segments: PathSegment[] = [
      { type: "moveTo", x: px, y: y },
      { type: "lineTo", x: px, y: y + h },
    ];
    rc.rPath(segments, {
      stroke: { color: patternColor, width: lineWidth },
    });
  }

  for (let py = y; py <= y + h; py += gridSpacing) {
    const segments: PathSegment[] = [
      { type: "moveTo", x: x, y: py },
      { type: "lineTo", x: x + w, y: py },
    ];
    rc.rPath(segments, {
      stroke: { color: patternColor, width: lineWidth },
    });
  }
}
