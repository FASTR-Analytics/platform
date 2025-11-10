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
  return getColor(strategy as ColorKeyOrString);
}
