// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims, RenderContext } from "./deps.ts";
import type { PatternConfig } from "./types.ts";
import { createSeededRandom, resolveToHex } from "./color_utils.ts";
import { renderOvals } from "./_internal/ovals.ts";
import { renderCircles } from "./_internal/circles.ts";
import { renderDots } from "./_internal/dots.ts";
import { renderLines } from "./_internal/lines.ts";
import { renderGrid } from "./_internal/grid.ts";
import { renderChevrons } from "./_internal/chevrons.ts";
import { renderWaves } from "./_internal/waves.ts";
import { renderNoise } from "./_internal/noise.ts";

export function renderPattern(
  rc: RenderContext,
  bounds: RectCoordsDims,
  config: PatternConfig,
): void {
  if (config.type === "none") return;

  const baseHex = resolveToHex(config.baseColor);
  const scale = config.scale ?? 1;
  const contrast = config.contrast ?? 1;
  const random = config.seed !== undefined
    ? createSeededRandom(config.seed)
    : Math.random;

  rc.withClip(bounds, () => {
    switch (config.type) {
      case "ovals":
        renderOvals(rc, bounds, baseHex, scale, contrast, random);
        break;
      case "circles":
        renderCircles(rc, bounds, baseHex, scale, contrast, random);
        break;
      case "dots":
        renderDots(rc, bounds, baseHex, scale, contrast);
        break;
      case "lines":
        renderLines(rc, bounds, baseHex, scale, contrast);
        break;
      case "grid":
        renderGrid(rc, bounds, baseHex, scale, contrast);
        break;
      case "chevrons":
        renderChevrons(rc, bounds, baseHex, scale, contrast);
        break;
      case "waves":
        renderWaves(rc, bounds, baseHex, scale, contrast);
        break;
      case "noise":
        renderNoise(rc, bounds, baseHex, scale, contrast, random);
        break;
    }
  });
}
