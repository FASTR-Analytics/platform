// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type CustomStyleTextOptions,
  type FontInfo,
  type FontKeyOrFontInfo,
  type FontVariants,
  type FontVariantsCustomStyle,
  type FontVariantsKeyed,
  getColor,
  getFont,
  getFontInfoId,
  type TextInfo,
  type TextInfoUnkeyed,
} from "./deps.ts";

export function m<T>(cs: T | undefined, gs: T | undefined, ds: T): T {
  return cs ?? gs ?? ds;
}

export function ms(
  sf: number,
  cs: number | undefined,
  gs: number | undefined,
  ds: number,
): number {
  return sf * (cs ?? gs ?? ds);
}

export function getTextInfo(
  cText: CustomStyleTextOptions | undefined,
  gText: CustomStyleTextOptions | undefined,
  baseText: TextInfo,
): TextInfoUnkeyed {
  const rawColor = m(cText?.color, gText?.color, baseText.color);
  const rawLineHeight = m(
    cText?.lineHeight,
    gText?.lineHeight,
    baseText.lineHeight,
  );
  const rawLineBreakGap = m(
    cText?.lineBreakGap,
    gText?.lineBreakGap,
    baseText.lineBreakGap,
  );
  const rawLetterSpacing = m(
    cText?.letterSpacing,
    gText?.letterSpacing,
    baseText.letterSpacing,
  );
  return {
    font: getMergedFont(cText, gText, baseText.font),
    fontSize: baseText.fontSize *
      (cText?.relFontSize ?? gText?.relFontSize ?? 1),
    color: getColor(rawColor === "same-as-base" ? baseText.color : rawColor),
    lineHeight: rawLineHeight === "same-as-base"
      ? baseText.lineHeight
      : rawLineHeight,
    lineBreakGap: rawLineBreakGap === "same-as-base"
      ? baseText.lineBreakGap
      : rawLineBreakGap,
    letterSpacing: rawLetterSpacing === "same-as-base"
      ? baseText.letterSpacing
      : rawLetterSpacing,
    fontVariants: getMergedFontVariants(cText, gText, baseText.fontVariants),
  };
}

export function getMergedFont(
  cText: CustomStyleTextOptions | undefined,
  gText: CustomStyleTextOptions | undefined,
  baseFont: FontKeyOrFontInfo,
): FontInfo {
  const rawFont = m(cText?.font, gText?.font, baseFont);
  return getFont(rawFont === "same-as-base" ? baseFont : rawFont);
}

export function getMergedFontVariants(
  cText: CustomStyleTextOptions | undefined,
  gText: CustomStyleTextOptions | undefined,
  baseFontVariants: FontVariantsKeyed | undefined,
): FontVariants | undefined {
  const rawFontVariants = m(
    cText?.fontVariants,
    gText?.fontVariants,
    baseFontVariants,
  );

  if (!rawFontVariants || rawFontVariants === "same-as-base") {
    // If "same-as-base", use the base font variants (if they exist) and convert to FontVariants
    if (rawFontVariants === "same-as-base" && baseFontVariants) {
      return {
        bold: baseFontVariants.bold
          ? getFont(baseFontVariants.bold)
          : undefined,
        italic: baseFontVariants.italic
          ? getFont(baseFontVariants.italic)
          : undefined,
        boldAndItalic: baseFontVariants.boldAndItalic
          ? getFont(baseFontVariants.boldAndItalic)
          : undefined,
      };
    }
    return undefined;
  }

  // Handle FontVariantsCustomStyle - need to resolve "same-as-base" for individual variants
  const variants = rawFontVariants as
    | FontVariantsCustomStyle
    | FontVariantsKeyed;
  const result: FontVariants = {};

  if (variants.bold) {
    if (variants.bold === "same-as-base" && baseFontVariants?.bold) {
      result.bold = getFont(baseFontVariants.bold);
    } else if (variants.bold === "same-as-regular") {
      // Explicitly set to undefined to use synthetic bold
      // Don't add to result
    } else if (variants.bold !== "same-as-base") {
      result.bold = getFont(variants.bold);
    }
  }

  if (variants.italic) {
    if (variants.italic === "same-as-base" && baseFontVariants?.italic) {
      result.italic = getFont(baseFontVariants.italic);
    } else if (variants.italic === "same-as-regular") {
      // Explicitly set to undefined to use synthetic italic
      // Don't add to result
    } else if (variants.italic !== "same-as-base") {
      result.italic = getFont(variants.italic);
    }
  }

  if (variants.boldAndItalic) {
    if (
      variants.boldAndItalic === "same-as-base" &&
      baseFontVariants?.boldAndItalic
    ) {
      result.boldAndItalic = getFont(baseFontVariants.boldAndItalic);
    } else if (variants.boldAndItalic === "same-as-regular") {
      // Explicitly set to undefined to use synthetic bold+italic
      // Don't add to result
    } else if (variants.boldAndItalic !== "same-as-base") {
      result.boldAndItalic = getFont(variants.boldAndItalic);
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function deduplicateFonts(fonts: FontInfo[]): FontInfo[] {
  const uniqueFontsMap = new Map<string, FontInfo>();
  for (const font of fonts) {
    const fontId = getFontInfoId(font);
    if (!uniqueFontsMap.has(fontId)) {
      uniqueFontsMap.set(fontId, font);
    }
  }
  return Array.from(uniqueFontsMap.values());
}
