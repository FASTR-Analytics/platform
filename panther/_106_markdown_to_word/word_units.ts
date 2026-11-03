// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color } from "./deps.ts";

export function pixelsToHalfPoints(pixels: number): number {
  // Assumes 96 DPI (standard web)
  // 1 inch = 72 points = 96 pixels
  // pixels * 72/96 = points
  // points * 2 = half-points
  return Math.round(pixels * (72 / 96) * 2);
}

export function pixelsToTwips(pixels: number): number {
  // 1 inch = 1440 twips = 96 pixels
  return Math.round(pixels * (1440 / 96));
}

export function lineHeightToWordSpacing(lineHeight: number): number {
  // Word line spacing: 240 = single spacing (1.0x)
  return Math.round(lineHeight * 240);
}

export function emToInches(em: number, fontSize: number): number {
  // Convert em to pixels first, then to inches
  const pixels = em * fontSize;
  return pixels / 96;
}

// Word has no alpha: a translucent colour is flattened over the white page
// before it is written as the six hex digits docx takes.
export function wordHex(color: string): string {
  const c = new Color(color);
  return c.tint(1 - c.rgba().a).hexNoHash();
}
