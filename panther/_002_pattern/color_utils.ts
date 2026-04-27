// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color, getColor } from "./deps.ts";
import type { ColorKeyOrString } from "./deps.ts";

export function resolveToHex(color: ColorKeyOrString): string {
  return getColor(color);
}

export function isLightColor(hex: string): boolean {
  const c = new Color(hex);
  return c.isLight();
}

export function derivePatternColor(baseHex: string, contrast = 1): string {
  const c = new Color(baseHex);
  const hsl = c.hsl();
  const shift = 15 * contrast;

  if (c.isLight()) {
    const newL = Math.max(hsl.l - shift, 5);
    return new Color({ h: hsl.h, s: hsl.s, l: newL }).css();
  } else {
    const newL = Math.min(hsl.l + shift, 95);
    return new Color({ h: hsl.h, s: hsl.s, l: newL }).css();
  }
}

export function createSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
