// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type ColorKeyOrString, getColor } from "./deps.ts";

const OFFICIAL_BASE_TEXT: TextInfo = {
  font: { fontFamily: "Inter", weight: 400, italic: false },
  fontSize: 14,
  color: { key: "baseContent" },
  lineHeight: 1.2,
  lineBreakGap: 0.5,
  letterSpacing: "0px",
};

let _baseText: TextInfo = { ...OFFICIAL_BASE_TEXT };

export function getBaseText(): TextInfo {
  return _baseText;
}

export function setBaseText(options: TextInfoOptions): void {
  _baseText = {
    font: options.font
      ? { ..._baseText.font, ...options.font }
      : _baseText.font,
    fontSize: options.fontSize ?? _baseText.fontSize,
    color: options.color ?? _baseText.color,
    lineHeight: options.lineHeight ?? _baseText.lineHeight,
    lineBreakGap: options.lineBreakGap ?? _baseText.lineBreakGap,
    letterSpacing: options.letterSpacing ?? _baseText.letterSpacing,
  };
}

export type TextInfoUnkeyed = {
  font: FontInfo;
  fontSize: number;
  color: string;
  lineHeight: number;
  lineBreakGap: number | "none";
  letterSpacing: "0px" | "-0.02em";
};

export type TextInfo = {
  font: FontInfo;
  fontSize: number;
  color: ColorKeyOrString;
  lineHeight: number;
  lineBreakGap: number | "none";
  letterSpacing: "0px" | "-0.02em";
};

export type TextInfoOptions = {
  font?: FontInfoOptions;
  fontSize?: number;
  color?: ColorKeyOrString;
  lineHeight?: number;
  lineBreakGap?: number | "none";
  letterSpacing?: "0px" | "-0.02em";
};

export type CustomStyleTextOptions = {
  font?: FontInfoOptions | "same-as-base";
  relFontSize?: number;
  color?: ColorKeyOrString | "same-as-base";
  lineHeight?: number | "same-as-base";
  lineBreakGap?: number | "none" | "same-as-base";
  letterSpacing?: "0px" | "-0.02em" | "same-as-base";
};

export type TextAdjustmentOptions = {
  fontSizeMultiplier?: number;
  color?: ColorKeyOrString;
  font?: FontInfoOptions;
  lineHeight?: number;
  lineBreakGap?: number | "none";
  letterSpacing?: "0px" | "-0.02em";
};

export function getAdjustedText(
  textStyle: TextInfoUnkeyed,
  adjustments?: TextAdjustmentOptions,
): TextInfoUnkeyed {
  return {
    font: getAdjustedFont(textStyle.font, adjustments?.font),
    fontSize: textStyle.fontSize * (adjustments?.fontSizeMultiplier ?? 1),
    color: getColor(adjustments?.color ?? textStyle.color),
    lineHeight: adjustments?.lineHeight ?? textStyle.lineHeight,
    lineBreakGap: adjustments?.lineBreakGap ?? textStyle.lineBreakGap,
    letterSpacing: adjustments?.letterSpacing ?? textStyle.letterSpacing,
  };
}

export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type FontInfo = {
  fontFamily: string;
  weight: FontWeight;
  italic: boolean;
};

export type FontInfoOptions = Partial<FontInfo>;

export function getAdjustedFont(
  base: FontInfo,
  override?: FontInfoOptions | "same-as-base",
): FontInfo {
  if (!override || override === "same-as-base") return base;

  return {
    fontFamily: override.fontFamily ?? base.fontFamily,
    weight: override.weight ?? base.weight,
    italic: override.italic ?? base.italic,
  };
}

export function getFontInfoId(font: FontInfo): string {
  return `${
    font.fontFamily
      .replaceAll(" ", "")
      .replaceAll("'", "")
  }-${font.weight}-${font.italic ? "italic" : "normal"}`;
}

export type StyleWithFontRegistration = {
  getFontsToRegister(): FontInfo[];
};
