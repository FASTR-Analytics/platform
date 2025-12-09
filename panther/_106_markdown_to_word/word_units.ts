// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

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

export function rgbToHex(color: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return toHex(color.r) + toHex(color.g) + toHex(color.b);
}
