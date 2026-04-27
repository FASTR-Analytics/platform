// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color, type ColorOptions, type ColorRgb } from "./color_class.ts";
import {
  KEY_COLOR_THEMES,
  type KeyColorThemeName,
} from "./key_color_themes.ts";
import type { ColorKeyOrString, KeyColors, KeyColorsKey } from "./types.ts";

const _defaultTheme = KEY_COLOR_THEMES["panther-default"].colors;

const _KEY_COLORS = new Map<KeyColorsKey, string>([
  ["base100", _defaultTheme.base100],
  ["base200", _defaultTheme.base200],
  ["base300", _defaultTheme.base300],
  ["baseContent", _defaultTheme.baseContent],
  ["primary", _defaultTheme.primary],
  ["primaryContent", _defaultTheme.primaryContent],
  ["neutral", _defaultTheme.neutral],
  ["neutralContent", _defaultTheme.neutralContent],
  ["success", _defaultTheme.success],
  ["successContent", _defaultTheme.successContent],
  ["warning", _defaultTheme.warning],
  ["warningContent", _defaultTheme.warningContent],
  ["danger", _defaultTheme.danger],
  ["dangerContent", _defaultTheme.dangerContent],
]);

export function setKeyColors(kc: Partial<KeyColors> | KeyColorThemeName) {
  const colors = typeof kc === "string" ? KEY_COLOR_THEMES[kc].colors : kc;
  for (
    const [key, value] of Object.entries(colors) as [KeyColorsKey, string][]
  ) {
    _KEY_COLORS.set(key, value);
  }
}

export function getColor(colorKey: ColorKeyOrString): string {
  if (colorKey === "none") {
    return "none";
  }
  if (typeof colorKey === "string") {
    return normalizeToHex(colorKey);
  }
  const finalColor = _KEY_COLORS.get(colorKey.key);
  if (!finalColor) {
    throw new Error("No color for this color key");
  }
  return normalizeToHex(finalColor);
}

function normalizeToHex(color: string): string {
  if (color === "none" || color === "transparent" || color.at(0) === "#") {
    return color;
  }
  return new Color(color).css();
}

export function getColorAsRgb(colorKey: ColorKeyOrString): ColorRgb {
  if (colorKey === "none") {
    throw new Error("Cannot use 'none' when getting rgba");
  }
  if (typeof colorKey === "string") {
    return new Color(colorKey).rgb();
  }
  const finalColor = _KEY_COLORS.get(colorKey.key);
  if (!finalColor) {
    throw new Error("No color for this color key");
  }
  return new Color(finalColor).rgb();
}

export function getKeyColorsFromPrimaryColor(primary: ColorOptions): KeyColors {
  const primaryColor = new Color(primary);
  const { h } = primaryColor.hsl();

  const base100 = new Color(Color.hslToRgb({ h, s: 2, l: 99 })).css();
  const base200 = new Color(Color.hslToRgb({ h, s: 3, l: 94 })).css();
  const base300 = new Color(Color.hslToRgb({ h, s: 5, l: 83 })).css();
  const baseContent = new Color(Color.hslToRgb({ h, s: 8, l: 12 })).css();

  const primaryContent = primaryColor.isLight() ? baseContent : base100;

  return {
    base100,
    base200,
    base300,
    baseContent,
    primary: primaryColor.css(),
    primaryContent,
    neutral: new Color(Color.hslToRgb({ h, s: 5, l: 50 })).css(),
    neutralContent: base100,
    success: "#059669",
    successContent: "#ffffff",
    warning: "#d97706",
    warningContent: "#ffffff",
    danger: "#dc2626",
    dangerContent: "#ffffff",
  };
}

export function generateKeyColorsFromPrimary(
  primary: ColorOptions,
  mode: "light" | "dark",
): KeyColors {
  const n = 20;
  const primaryColor = new Color(primary);

  if (mode === "light") {
    const scaleFromWhite = Color.scale("#fff", primaryColor, n);
    const scaleFromBlack = Color.scale("#000", primaryColor, n);
    return {
      base100: scaleFromWhite[0],
      base200: scaleFromWhite[1],
      base300: scaleFromWhite[2],
      baseContent: scaleFromBlack[4],
      primary: primaryColor.css(),
      primaryContent: scaleFromWhite[0],
      neutral: "#6b7280",
      neutralContent: "#ffffff",
      success: "#059669",
      successContent: "#ffffff",
      warning: "#d97706",
      warningContent: "#ffffff",
      danger: "#dc2626",
      dangerContent: "#ffffff",
    };
  }

  const scaleToDark = Color.scale(primaryColor, "#000", n);
  const scaleToLight = Color.scale(primaryColor, "#fff", n);
  return {
    base100: scaleToDark[n - 3],
    base200: scaleToDark[n - 4],
    base300: scaleToDark[n - 6],
    baseContent: scaleToLight[n - 1],
    primary: scaleToLight[n - 3],
    primaryContent: scaleToDark[n - 2],
    neutral: "#a1a1aa",
    neutralContent: "#18181b",
    success: "#4ade80",
    successContent: "#052e16",
    warning: "#facc15",
    warningContent: "#422006",
    danger: "#f87171",
    dangerContent: "#450a0a",
  };
}
