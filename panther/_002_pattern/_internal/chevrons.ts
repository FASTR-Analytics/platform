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

export function renderChevrons(
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

  const chevronWidth = 120 * scale;
  const chevronHeight = 60 * scale;
  const lineWidth = 6 * scale;
  const spacingX = chevronWidth * 1.2;
  const spacingY = chevronHeight * 1.5;

  let row = 0;
  for (let py = y; py < y + h + chevronHeight; py += spacingY) {
    const offsetX = (row % 2) * (spacingX / 2);
    for (
      let px = x - spacingX + offsetX;
      px < x + w + spacingX;
      px += spacingX
    ) {
      const segments: PathSegment[] = [
        { type: "moveTo", x: px, y: py + chevronHeight / 2 },
        { type: "lineTo", x: px + chevronWidth / 2, y: py },
        { type: "lineTo", x: px + chevronWidth, y: py + chevronHeight / 2 },
      ];
      rc.rPath(segments, {
        stroke: { color: patternColor, width: lineWidth },
      });
    }
    row++;
  }
}
