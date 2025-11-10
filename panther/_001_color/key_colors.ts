// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color, type ColorOptions, type ColorRgb } from "./color_class.ts";
import { assert } from "./deps.ts";
import { TIM_COLOR_SETS } from "./tim_colors.ts";
import type { ColorKeyOrString, KeyColors, KeyColorsKey } from "./types.ts";

const _KEY_COLORS = new Map<KeyColorsKey, string>([
  ["base100", TIM_COLOR_SETS.DarkBlue.base100],
  ["base200", TIM_COLOR_SETS.DarkBlue.base200],
  ["base300", TIM_COLOR_SETS.DarkBlue.base300],
  ["baseContent", TIM_COLOR_SETS.DarkBlue.baseContent],
  ["baseContentLessVisible", TIM_COLOR_SETS.DarkBlue.baseContentLessVisible],
  ["primary", TIM_COLOR_SETS.DarkBlue.primary],
  ["primaryContent", TIM_COLOR_SETS.DarkBlue.primaryContent],
]);

export function setKeyColors(kc: KeyColors) {
  _KEY_COLORS.clear();
  _KEY_COLORS.set("base100", kc.base100);
  _KEY_COLORS.set("base200", kc.base200);
  _KEY_COLORS.set("base300", kc.base300);
  _KEY_COLORS.set("baseContent", kc.baseContent);
  _KEY_COLORS.set("baseContentLessVisible", kc.baseContentLessVisible);
  _KEY_COLORS.set("primary", kc.primary);
  _KEY_COLORS.set("primaryContent", kc.primaryContent);
}

export function getColor(colorKey: ColorKeyOrString): string {
  if (colorKey === "none") {
    return "none";
  }
  if (typeof colorKey === "string") {
    return colorKey;
  }
  const finalColor = _KEY_COLORS.get(colorKey.key);
  if (!finalColor) {
    console.log(finalColor);
    throw new Error("No color for this color key");
  }
  return finalColor;
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

export function generateKeyColors(
  color: ColorOptions,
  nForContrast: number,
  whiteStartIndex: number,
  blackStartIndex: number,
): KeyColors {
  const n = nForContrast;
  const iw = whiteStartIndex;
  const ib = blackStartIndex;
  assert(
    n > iw + 2 && n > ib + 4,
    "nForContrast must be higher to allow for start indexes",
  );
  const primaryColor = new Color(color);
  const scaleFromWhite = Color.scale("#fff", primaryColor, n);
  const scaleFromBlack = Color.scale("#000", primaryColor, n);

  const base100 = scaleFromWhite[iw];
  const base200 = scaleFromWhite[iw + 1];
  const base300 = scaleFromWhite[iw + 2];
  const baseContent = scaleFromBlack[ib];
  const baseContentLessVisible = scaleFromBlack[ib + 4];
  const primary = primaryColor.css();
  const primaryContent = scaleFromWhite[iw];

  console.log("%cbase100 XXXXXXXXXXXXXXXXX", `color: ${base100}`);
  console.log("%cbase200 XXXXXXXXXXXXXXXXX", `color: ${base200}`);
  console.log("%cbase300 XXXXXXXXXXXXXXXXX", `color: ${base300}`);
  console.log("%cbaseContent XXXXXXXXXXXXX", `color: ${baseContent}`);
  console.log(
    "%cbaseContentLessVisible XX",
    `color: ${baseContentLessVisible}`,
  );
  console.log("%cprimary XXXXXXXXXXXXXXXXX", `color: ${primary}`);
  console.log("%cprimaryContent XXXXXXXXXX", `color: ${primaryContent}`);

  return {
    base100,
    base200,
    base300,
    baseContent,
    baseContentLessVisible,
    primary,
    primaryContent,
  };
}
