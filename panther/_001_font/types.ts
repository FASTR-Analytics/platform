// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type ColorKeyOrString, getColor } from "./deps.ts";
import { getFont } from "./key_fonts.ts";

export type TextInfoUnkeyed = {
  font: FontInfo;
  fontSize: number;
  color: string;
  lineHeight: number;
  lineBreakGap: number | "none";
  letterSpacing: "0px" | "-0.02em";
  fontVariants?: FontVariants;
};

export type TextInfo = {
  font: FontKeyOrFontInfo;
  fontSize: number;
  color: ColorKeyOrString;
  lineHeight: number;
  lineBreakGap: number | "none";
  letterSpacing: "0px" | "-0.02em";
  fontVariants?: FontVariantsKeyed;
};

export type TextInfoOptions = {
  font?: FontKeyOrFontInfo;
  fontSize?: number;
  color?: ColorKeyOrString;
  lineHeight?: number;
  lineBreakGap?: number | "none";
  letterSpacing?: "0px" | "-0.02em";
  fontVariants?: FontVariantsKeyed;
};

export type CustomStyleTextOptions = {
  font?: FontKeyOrFontInfo | "same-as-base";
  relFontSize?: number;
  color?: ColorKeyOrString | "same-as-base";
  lineHeight?: number | "same-as-base";
  lineBreakGap?: number | "none" | "same-as-base";
  letterSpacing?: "0px" | "-0.02em" | "same-as-base";
  fontVariants?: FontVariantsCustomStyle | "same-as-base";
};

export type TextAdjustmentOptions = {
  fontSizeMultiplier?: number;
  color?: ColorKeyOrString;
  font?: FontKeyOrFontInfo;
  lineHeight?: number;
  lineBreakGap?: number | "none";
  letterSpacing?: "0px" | "-0.02em";
  fontVariants?: FontVariantsKeyed;
};

export function getAdjustedText(
  textStyle: TextInfoUnkeyed,
  adjustments?: TextAdjustmentOptions,
): TextInfoUnkeyed {
  // Clone to ensure we don't mutate the input
  const textInfo: TextInfo = structuredClone(textStyle);

  // Process fontVariants if provided in adjustments
  let fontVariants: FontVariants | undefined = textStyle.fontVariants;
  if (adjustments?.fontVariants) {
    fontVariants = {
      bold: adjustments.fontVariants.bold
        ? getFont(adjustments.fontVariants.bold)
        : fontVariants?.bold,
      italic: adjustments.fontVariants.italic
        ? getFont(adjustments.fontVariants.italic)
        : fontVariants?.italic,
      boldAndItalic: adjustments.fontVariants.boldAndItalic
        ? getFont(adjustments.fontVariants.boldAndItalic)
        : fontVariants?.boldAndItalic,
    };
  }

  return {
    font: getFont(adjustments?.font ?? textInfo.font),
    fontSize: textInfo.fontSize * (adjustments?.fontSizeMultiplier ?? 1),
    color: getColor(adjustments?.color ?? textInfo.color),
    lineHeight: adjustments?.lineHeight ?? textInfo.lineHeight,
    lineBreakGap: adjustments?.lineBreakGap ?? textInfo.lineBreakGap,
    letterSpacing: adjustments?.letterSpacing ?? textInfo.letterSpacing,
    fontVariants,
  };
}

export type FontInfo = {
  fontFamily: string;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  italic: boolean;
};

export function getFontInfoId(font: FontInfo): string {
  return `${
    font.fontFamily.replaceAll(" ", "").replaceAll("'", "")
  }-${font.weight}-${font.italic ? "italic" : "normal"}`;
}

export type KeyFonts = {
  main400: FontInfo;
  main700: FontInfo;
};

export type KeyFontsKey = keyof KeyFonts;

export type FontKeyOrFontInfo = { key: KeyFontsKey } | FontInfo;

export type FontVariants = {
  bold?: FontInfo;
  italic?: FontInfo;
  boldAndItalic?: FontInfo;
};

export type FontVariantsKeyed = {
  bold?: FontKeyOrFontInfo;
  italic?: FontKeyOrFontInfo;
  boldAndItalic?: FontKeyOrFontInfo;
};

export type FontVariantsCustomStyle = {
  bold?: FontKeyOrFontInfo | "same-as-base" | "same-as-regular";
  italic?: FontKeyOrFontInfo | "same-as-base" | "same-as-regular";
  boldAndItalic?: FontKeyOrFontInfo | "same-as-base" | "same-as-regular";
};

export function isFontKeyAsKey(
  fk: FontKeyOrFontInfo,
): fk is { key: KeyFontsKey } {
  return (fk as { key: KeyFontsKey }).key !== undefined;
}
