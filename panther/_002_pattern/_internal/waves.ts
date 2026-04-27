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

export function renderWaves(
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

  const waveHeight = 40 * scale;
  const waveLength = 160 * scale;
  const lineWidth = 6 * scale;
  const spacing = waveHeight * 3;

  for (let py = y; py < y + h + spacing; py += spacing) {
    const segments: PathSegment[] = [{ type: "moveTo", x: x, y: py }];

    for (let px = x; px < x + w + waveLength; px += waveLength) {
      segments.push({
        type: "bezierCurveTo",
        cp1x: px + waveLength * 0.25,
        cp1y: py - waveHeight,
        cp2x: px + waveLength * 0.75,
        cp2y: py + waveHeight,
        x: px + waveLength,
        y: py,
      });
    }

    rc.rPath(segments, {
      stroke: { color: patternColor, width: lineWidth },
    });
  }
}
