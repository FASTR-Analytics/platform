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

export function renderLines(
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

  const lineSpacing = 60 * scale;
  const lineWidth = 6 * scale;
  const diagonal = Math.sqrt(w * w + h * h);

  for (let offset = -diagonal; offset < diagonal; offset += lineSpacing) {
    const segments: PathSegment[] = [
      { type: "moveTo", x: x + offset, y: y },
      { type: "lineTo", x: x + offset + h, y: y + h },
    ];
    rc.rPath(segments, {
      stroke: { color: patternColor, width: lineWidth },
    });
  }
}
