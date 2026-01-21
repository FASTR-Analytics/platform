// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
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

export function resolveAutofitOptions(
  autofit: boolean | MarkdownAutofitOptions | undefined,
): ResolvedAutofitOptions | null {
  if (!autofit) return null;
  if (autofit === true) {
    return {
      minScale: 0,
      maxScale: 1,
      minFontSize: 0,
    };
  }
  return {
    minScale: autofit.minScale ?? 0,
    maxScale: autofit.maxScale ?? 1,
    minFontSize: autofit.minFontSize ?? 0,
  };
}

export function getDiscreteScales(
  baseFontSize: number,
  options: ResolvedAutofitOptions,
): { shrinkScales: number[]; growScales: number[] } {
  const shrinkScales: number[] = [];
  const growScales: number[] = [];

  // Generate shrink scales (smaller than 1.0)
  // Go down by 1pt at a time: 14/14=1.0, 13/14≈0.929, 12/14≈0.857, etc.
  for (let pt = baseFontSize - 1; pt >= 1; pt--) {
    const scale = pt / baseFontSize;

    // Stop if below minScale
    if (scale < options.minScale) break;

    // Stop if resulting font size would be below minFontSize
    if (pt < options.minFontSize) break;

    shrinkScales.push(scale);
  }

  // Generate grow scales (larger than 1.0)
  // Go up by 1pt at a time: 15/14≈1.071, 16/14≈1.143, etc.
  if (options.maxScale > 1) {
    for (let pt = baseFontSize + 1; pt <= baseFontSize * 3; pt++) {
      const scale = pt / baseFontSize;

      // Stop if above maxScale
      if (scale > options.maxScale) break;

      growScales.push(scale);
    }
  }

  return { shrinkScales, growScales };
}

export function getHeightAtScale(
  rc: RenderContext,
  width: number,
  input: MarkdownRendererInput,
  scale: number,
): number {
  const scaledInput: MarkdownRendererInput = {
    ...input,
    style: { ...input.style, scale: (input.style?.scale ?? 1) * scale },
  };
  const bounds = new RectCoordsDims({ x: 0, y: 0, w: width, h: 99999 });
  const measured = measureMarkdown(rc, bounds, scaledInput);
  return measured.bounds.h();
}

export function findOptimalScale(
  rc: RenderContext,
  width: number,
  availableHeight: number,
  input: MarkdownRendererInput,
  baseFontSize: number,
  options: ResolvedAutofitOptions,
): number {
  const { shrinkScales, growScales } = getDiscreteScales(baseFontSize, options);

  // First, try scale 1.0
  const heightAt1 = getHeightAtScale(rc, width, input, 1.0);

  if (heightAt1 <= availableHeight) {
    // Content fits at scale 1.0 - try growing if allowed
    if (growScales.length > 0) {
      // Binary search for largest grow scale that still fits
      let lo = 0;
      let hi = growScales.length - 1;
      let bestScale = 1.0;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const h = getHeightAtScale(rc, width, input, growScales[mid]);
        if (h <= availableHeight) {
          bestScale = growScales[mid];
          lo = mid + 1; // Try even larger scales
        } else {
          hi = mid - 1; // Scale is too big
        }
      }
      return bestScale;
    }
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

  const effectiveMaxScale = Math.min(options.maxScale, 3);

  const minH = minScale < 1 ? getHeightAtScale(rc, width, input, minScale) : idealH;
  const maxH = effectiveMaxScale > 1 ? getHeightAtScale(rc, width, input, effectiveMaxScale) : idealH;

  return { minH, idealH, maxH };
}
