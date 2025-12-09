// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ColorKeyOrString,
  type CustomStyleTextOptions,
  getAdjustedFont,
  getColor,
  type MergedSimpleVizStyle,
  Padding,
  type TextInfo,
  type TextInfoUnkeyed,
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

export function getTextInfoWithBoxOverride(
  boxTextStyle: CustomStyleTextOptions | undefined,
  mergedTextInfo: TextInfoUnkeyed,
  baseText: TextInfo,
): TextInfoUnkeyed {
  if (!boxTextStyle) {
    return mergedTextInfo;
  }

  // Font
  let font = mergedTextInfo.font;
  if (boxTextStyle.font !== undefined) {
    font = getAdjustedFont(mergedTextInfo.font, boxTextStyle.font);
  }

  // Font size - relFontSize is ALWAYS relative to base
  const fontSize = boxTextStyle?.relFontSize !== undefined
    ? baseText.fontSize * boxTextStyle.relFontSize
    : mergedTextInfo.fontSize;

  // Color
  let color = mergedTextInfo.color;
  if (boxTextStyle.color !== undefined) {
    const rawColor = boxTextStyle.color === "same-as-base"
      ? baseText.color
      : boxTextStyle.color;
    color = getColor(rawColor);
  }

  // Line height
  let lineHeight = mergedTextInfo.lineHeight;
  if (boxTextStyle.lineHeight !== undefined) {
    lineHeight = boxTextStyle.lineHeight === "same-as-base"
      ? baseText.lineHeight
      : boxTextStyle.lineHeight;
  }

  // Line break gap
  let lineBreakGap = mergedTextInfo.lineBreakGap;
  if (boxTextStyle.lineBreakGap !== undefined) {
    lineBreakGap = boxTextStyle.lineBreakGap === "same-as-base"
      ? baseText.lineBreakGap
      : boxTextStyle.lineBreakGap;
  }

  // Letter spacing
  let letterSpacing = mergedTextInfo.letterSpacing;
  if (boxTextStyle.letterSpacing !== undefined) {
    letterSpacing = boxTextStyle.letterSpacing === "same-as-base"
      ? baseText.letterSpacing
      : boxTextStyle.letterSpacing;
  }

  return {
    font,
    fontSize,
    color,
    lineHeight,
    lineBreakGap,
    letterSpacing,
  };
}
