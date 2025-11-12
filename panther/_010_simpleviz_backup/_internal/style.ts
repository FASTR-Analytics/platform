// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding } from "../deps.ts";
import type {
  ColorKeyOrString,
  FontKeyOrFontInfo,
  MergedSimpleVizStyle,
} from "../deps.ts";
import type { RawBox } from "../types.ts";

export type MergedBoxStyle = {
  fillColor: ColorKeyOrString;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  textHorizontalAlign: "left" | "center" | "right";
  textVerticalAlign: "top" | "center" | "bottom";
  textGap: number;
  padding: Padding;
};

export function mergeBoxStyle(
  box: RawBox,
  defaults: MergedSimpleVizStyle["boxes"],
): MergedBoxStyle {
  return {
    fillColor: box.fillColor ?? defaults.fillColor,
    strokeColor: box.strokeColor ?? defaults.strokeColor,
    strokeWidth: box.strokeWidth ?? defaults.strokeWidth,
    textHorizontalAlign: box.textHorizontalAlign ??
      defaults.textHorizontalAlign,
    textVerticalAlign: box.textVerticalAlign ?? defaults.textVerticalAlign,
    textGap: box.textGap ?? defaults.textGap,
    padding: new Padding(box.padding ?? defaults.padding),
  };
}
