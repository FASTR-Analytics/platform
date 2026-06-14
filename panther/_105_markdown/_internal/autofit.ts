// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  MIN_FONT_SIZE_DU,
  RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type {
  MarkdownAutofitOptions,
  MarkdownRendererInput,
} from "../types.ts";
import { measureMarkdown } from "./measure_markdown.ts";

export type ResolvedAutofitOptions = {
  minScale: number;
  maxScale: number;
  minFontSize: number;
};

// Shrink-to-fit is ON by default (per the sizing model, D6): only an explicit
// `false` opts out. `true`, an options object, or omitting it all enable it.
// maxScale is capped at 1 so markdown never grows; `minFontSize` (DU) is the
// legibility floor, shared with figures via MIN_FONT_SIZE_DU.
export function resolveAutofitOptions(
  autofit: boolean | MarkdownAutofitOptions | undefined,
): ResolvedAutofitOptions | null {
  if (autofit === false) return null;
  if (autofit === true || autofit === undefined) {
    return {
      minScale: 0,
      maxScale: 1,
      minFontSize: MIN_FONT_SIZE_DU,
    };
  }
  return {
    minScale: autofit.minScale ?? 0,
    // shrink-to-fit never grows
    maxScale: Math.min(autofit.maxScale ?? 1, 1),
    minFontSize: autofit.minFontSize ?? MIN_FONT_SIZE_DU,
  };
}

// shrink-to-fit only: generate scales smaller than 1.0, down by 1pt at a time
// (14/14=1.0, 13/14≈0.929, 12/14≈0.857, …), stopping at the minScale / min-font
// floor. There is no grow path.
export function getDiscreteScales(
  baseFontSize: number,
  options: ResolvedAutofitOptions,
): number[] {
  const shrinkScales: number[] = [];

  for (let pt = baseFontSize - 1; pt >= 1; pt--) {
    const scale = pt / baseFontSize;

    // Stop if below minScale
    if (scale < options.minScale) break;

    // Stop if resulting font size would be below minFontSize
    if (pt < options.minFontSize) break;

    shrinkScales.push(scale);
  }

  return shrinkScales;
}

export function getHeightAtScale(
  rc: RenderContext,
  width: number,
  input: MarkdownRendererInput,
  scale: number,
): number {
  const bounds = new RectCoordsDims({ x: 0, y: 0, w: width, h: 99999 });

  try {
    // scale is threaded as the fitScale (shrink-to-fit factor), not style.scale.
    const measured = measureMarkdown(rc, bounds, input, scale);
    return measured.bounds.h();
  } catch (_err) {
    // Markdown contains tables/images which aren't supported in MarkdownRenderer
    // Return a conservative height estimate based on line count
    const lineCount = input.markdown.split("\n").length;
    const baseFontSize = input.style?.text?.base?.fontSize ?? 14;
    const scaledFontSize = baseFontSize * scale;
    const lineHeight = scaledFontSize * 1.5;
    return lineCount * lineHeight;
  }
}

export function findOptimalScale(
  rc: RenderContext,
  width: number,
  availableHeight: number,
  input: MarkdownRendererInput,
  baseFontSize: number,
  options: ResolvedAutofitOptions,
): number {
  const shrinkScales = getDiscreteScales(baseFontSize, options);

  // First, try scale 1.0
  const heightAt1 = getHeightAtScale(rc, width, input, 1.0);

  if (heightAt1 <= availableHeight) {
    // Content fits at scale 1.0 - shrink-to-fit never grows
    return 1.0;
  }

  // Content doesn't fit at scale 1.0 - need to shrink
  if (shrinkScales.length === 0) {
    return 1.0; // Can't shrink, return 1.0
  }

  // Binary search for largest shrink scale that fits
  let lo = 0;
  let hi = shrinkScales.length - 1;
  let bestScale = shrinkScales[shrinkScales.length - 1]; // Smallest scale as fallback

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const h = getHeightAtScale(rc, width, input, shrinkScales[mid]);
    if (h <= availableHeight) {
      bestScale = shrinkScales[mid];
      hi = mid - 1; // Try larger scales (closer to 1.0)
    } else {
      lo = mid + 1; // Need smaller scale
    }
  }

  return bestScale;
}

export type AutofitHeightConstraints = {
  minH: number;
  idealH: number;
  maxH: number;
};

export function getAutofitHeightConstraints(
  rc: RenderContext,
  width: number,
  input: MarkdownRendererInput,
  baseFontSize: number,
  options: ResolvedAutofitOptions,
): AutofitHeightConstraints {
  const idealH = getHeightAtScale(rc, width, input, 1.0);

  // Calculate minH (height at minimum allowed scale)
  let minScale = options.minScale;
  if (options.minFontSize > 0) {
    const scaleFromMinFont = options.minFontSize / baseFontSize;
    minScale = Math.max(minScale, scaleFromMinFont);
  }

  // If minScale is 0 or very small, use a reasonable floor
  if (minScale <= 0) {
    minScale = 1 / baseFontSize; // Effectively 1pt font
  }

  const minH = minScale < 1
    ? getHeightAtScale(rc, width, input, minScale)
    : idealH;
  // shrink-to-fit never grows, so maxH is the ideal (full-size) height.
  let maxH = idealH;

  // Empty markdown should be growable (like placeholder)
  if (input.markdown.trim() === "") {
    maxH = Infinity;
  }

  return { minH, idealH, maxH };
}
