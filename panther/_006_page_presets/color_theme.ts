// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color } from "./deps.ts";
import {
  type ColorPreset,
  type ColorPresetId,
  getColorPreset,
} from "./color_presets.ts";

export type ColorTheme =
  | { type: "preset"; id: ColorPresetId }
  | { type: "custom"; primary: string };

export type BrandColorValidation =
  | { valid: true }
  | { valid: false; reason: string };

function isValidHex(hex: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

function hsl(h: number, s: number, l: number): string {
  return new Color({ h, s, l }).css();
}

export function validateBrandColor(hex: string): BrandColorValidation {
  if (!hex) {
    return { valid: false, reason: "No color provided" };
  }
  if (!isValidHex(hex)) {
    return { valid: false, reason: "Invalid hex color" };
  }
  const { l } = new Color(hex).hsl();
  if (l > 40) {
    return {
      valid: false,
      reason: "Color is too light — use a darker variant",
    };
  }
  return { valid: true };
}

function buildPresetFromCustomColor(primary: string): ColorPreset {
  const { h } = new Color(primary).hsl();
  return {
    id: "custom" as ColorPresetId,
    name: "Custom",
    hue: h,
    swatch: primary,
    base100: "#ffffff",
    base200: hsl(h, 25, 95),
    base300: hsl(h, 30, 90),
    baseContent: hsl(h, 30, 15),
    baseContentMuted: hsl(h, 15, 45),
    primary: primary,
    primaryContent: "#ffffff",
    primaryContentMuted: hsl(h, 20, 80),
  };
}

export function resolveColorTheme(theme: ColorTheme): ColorPreset {
  if (theme.type === "preset") {
    return getColorPreset(theme.id);
  }
  return buildPresetFromCustomColor(theme.primary);
}
