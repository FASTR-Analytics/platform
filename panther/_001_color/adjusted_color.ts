// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color } from "./color_class.ts";
import { getColor } from "./key_colors.ts";
import type { ColorKeyOrString } from "./types.ts";

export type ColorAdjustmentStrategy =
  | ColorAdjustmentStrategyOpacity
  | ColorAdjustmentStrategyBrighten
  | ColorAdjustmentStrategyDarken
  | ColorAdjustmentStrategyDesaturate
  | ColorAdjustmentStrategyTint
  | ColorAdjustmentStrategyTone
  | ColorAdjustmentStrategyLightDark
  | ColorKeyOrString;

type ColorAdjustmentStrategyOpacity = {
  opacity: number;
};
type ColorAdjustmentStrategyBrighten = {
  brighten: number;
};
type ColorAdjustmentStrategyDarken = {
  darken: number;
};
type ColorAdjustmentStrategyDesaturate = {
  desaturate: number;
};
type ColorAdjustmentStrategyTint = {
  tint: number;
};
type ColorAdjustmentStrategyTone = {
  tone: number;
};
type ColorAdjustmentStrategyLightDark = {
  ifLight: ColorKeyOrString;
  ifDark: ColorKeyOrString;
};

export function getAdjustedColor(
  color: ColorKeyOrString,
  strategy: ColorAdjustmentStrategy,
): string {
  if ((strategy as ColorAdjustmentStrategyBrighten).brighten !== undefined) {
    return new Color(getColor(color))
      .lighten((strategy as ColorAdjustmentStrategyBrighten).brighten)
      .css();
  }
  if ((strategy as ColorAdjustmentStrategyDarken).darken !== undefined) {
    return new Color(getColor(color))
      .darken((strategy as ColorAdjustmentStrategyDarken).darken)
      .css();
  }
  if ((strategy as ColorAdjustmentStrategyOpacity).opacity !== undefined) {
    return new Color(getColor(color))
      .opacity((strategy as ColorAdjustmentStrategyOpacity).opacity)
      .css();
  }
  if (
    (strategy as ColorAdjustmentStrategyDesaturate).desaturate !== undefined
  ) {
    return new Color(getColor(color))
      .desaturate((strategy as ColorAdjustmentStrategyDesaturate).desaturate)
      .css();
  }
  if ((strategy as ColorAdjustmentStrategyTint).tint !== undefined) {
    return new Color(getColor(color))
      .tint((strategy as ColorAdjustmentStrategyTint).tint)
      .css();
  }
  if ((strategy as ColorAdjustmentStrategyTone).tone !== undefined) {
    return new Color(getColor(color))
      .tone((strategy as ColorAdjustmentStrategyTone).tone)
      .css();
  }
  if ((strategy as ColorAdjustmentStrategyLightDark).ifLight !== undefined) {
    const s = strategy as ColorAdjustmentStrategyLightDark;
    const baseColor = new Color(getColor(color));
    return baseColor.isLight() ? getColor(s.ifLight) : getColor(s.ifDark);
  }
  return getColor(strategy as ColorKeyOrString);
}
