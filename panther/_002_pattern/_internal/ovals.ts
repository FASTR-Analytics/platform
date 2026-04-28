// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { RectCoordsDims } from "../deps.ts";
import type { RenderContext } from "../../_001_render_system/mod.ts";
import { derivePatternColor } from "../color_utils.ts";

export function renderOvals(
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
  const isLandscape = w > h;

  if (isLandscape) {
    const ext1 = h * (0.2 + random() * 0.1);
    const ext2 = h * (0.2 + random() * 0.1);
    const rectW1 = w * (0.35 + random() * 0.1) + ext1;
    const rectH1 = h * (0.35 + random() * 0.1) + ext1;
    const rectW2 = w * (0.35 + random() * 0.1) + ext2;
    const rectH2 = h * (0.35 + random() * 0.1) + ext2;

    rc.rRect(new RectCoordsDims([x - ext1, y - ext1, rectW1, rectH1]), {
      fillColor: patternColor,
      rectRadius: Math.min(rectW1, rectH1) * 0.5,
    });

    rc.rRect(
      new RectCoordsDims([
        x + w - rectW2 + ext2,
        y + h - rectH2 + ext2,
        rectW2,
        rectH2,
      ]),
      {
        fillColor: patternColor,
        rectRadius: Math.min(rectW2, rectH2) * 0.5,
      },
    );
  } else {
    const ext1 = w * (0.2 + random() * 0.1);
    const ext2 = w * (0.2 + random() * 0.1);
    const rectW1 = w * (0.35 + random() * 0.1) + ext1;
    const rectH1 = h * (0.35 + random() * 0.1) + ext1;
    const rectW2 = w * (0.35 + random() * 0.1) + ext2;
    const rectH2 = h * (0.35 + random() * 0.1) + ext2;

    rc.rRect(
      new RectCoordsDims([x + w - rectW1 + ext1, y - ext1, rectW1, rectH1]),
      {
        fillColor: patternColor,
        rectRadius: Math.min(rectW1, rectH1) * 0.5,
      },
    );

    rc.rRect(
      new RectCoordsDims([x - ext2, y + h - rectH2 + ext2, rectW2, rectH2]),
      {
        fillColor: patternColor,
        rectRadius: Math.min(rectW2, rectH2) * 0.5,
      },
    );
  }
}
