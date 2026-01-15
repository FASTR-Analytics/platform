// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getColor, m } from "./deps.ts";
import {
  type CustomStyleTextOptions,
  type FontInfo,
  type FontInfoOptions,
  type FontWeight,
  getAdjustedFont,
  getFontInfoId,
  type TextInfo,
  type TextInfoOptions,
  type TextInfoUnkeyed,
} from "./types.ts";

export function getAdjustedBaseTextOptions(
  shared: TextInfoOptions | undefined,
  domain: TextInfoOptions | undefined,
): TextInfoOptions | undefined {
  if (!shared && !domain) return undefined;
  if (!shared) return domain;
  if (!domain) return shared;

  let font: FontInfoOptions | undefined;
  if (shared.font || domain.font) {
    font = { ...shared.font, ...domain.font };
  }

  return {
    font,
    fontSize: domain.fontSize ?? shared.fontSize,
    color: domain.color ?? shared.color,
    lineHeight: domain.lineHeight ?? shared.lineHeight,
    lineBreakGap: domain.lineBreakGap ?? shared.lineBreakGap,
    letterSpacing: domain.letterSpacing ?? shared.letterSpacing,
  };
}

export function getBaseTextInfo(
  cBase: TextInfoOptions | undefined,
  gBase: TextInfoOptions | undefined,
  dBase: TextInfo,
  sf: number,
): TextInfo {
  return {
    font: getMergedFonts(cBase, gBase, dBase.font),
    fontSize: sf * m(cBase?.fontSize, gBase?.fontSize, dBase.fontSize),
    color: m(cBase?.color, gBase?.color, dBase.color),
    lineHeight: m(cBase?.lineHeight, gBase?.lineHeight, dBase.lineHeight),
    lineBreakGap: m(
      cBase?.lineBreakGap,
      gBase?.lineBreakGap,
      dBase.lineBreakGap,
    ),
    letterSpacing: m(
      cBase?.letterSpacing,
      gBase?.letterSpacing,
      dBase.letterSpacing,
    ),
  };
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
    font: getMergedFonts(cText, gText, baseText.font),
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
  };
}

export function getTextInfoForSpecialHeadings(
  cText: CustomStyleTextOptions | undefined,
  gText: CustomStyleTextOptions | undefined,
  defaultRelFontSize: number,
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

  const baseFontForPurposeOfSpecialHeadings = getAdjustedFont(baseText.font, {
    weight: Math.max(baseText.font.weight, 700) as FontWeight,
  });

  return {
    font: getMergedFonts(cText, gText, baseFontForPurposeOfSpecialHeadings),
    fontSize: baseText.fontSize *
      (cText?.relFontSize ?? gText?.relFontSize ?? defaultRelFontSize),
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
  };
}

export function getMergedFonts(
  cText: CustomStyleTextOptions | undefined,
  gText: CustomStyleTextOptions | undefined,
  baseFont: FontInfo,
): FontInfo {
  let result = baseFont;

  const gFont = gText?.font;
  if (gFont && gFont !== "same-as-base") {
    result = getAdjustedFont(result, gFont);
  }

  const cFont = cText?.font;
  if (cFont && cFont !== "same-as-base") {
    result = getAdjustedFont(result, cFont);
  }

  return result;
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

export function deriveAllVariants(font: FontInfo): FontInfo[] {
  const base = font;
  const bold: FontInfo = { ...font, weight: 700 };
  const italic: FontInfo = { ...font, italic: true };
  const boldItalic: FontInfo = { ...font, weight: 700, italic: true };
  return deduplicateFonts([base, bold, italic, boldItalic]);
}

export function getFontsToRegister<K extends string>(
  textStyleKeys: readonly K[],
  customText:
    | Record<string, CustomStyleTextOptions | TextInfoOptions>
    | undefined,
  globalText:
    | Record<string, CustomStyleTextOptions | TextInfoOptions>
    | undefined,
  defaultBaseFont: FontInfo,
): FontInfo[] {
  const baseFont = getMergedFonts(
    customText?.base as CustomStyleTextOptions | undefined,
    globalText?.base as CustomStyleTextOptions | undefined,
    defaultBaseFont,
  );

  const allFonts: FontInfo[] = [];

  for (const key of textStyleKeys) {
    let mainFont: FontInfo;
    if (key === "base") {
      mainFont = baseFont;
    } else {
      mainFont = getMergedFonts(
        customText?.[key] as CustomStyleTextOptions | undefined,
        globalText?.[key] as CustomStyleTextOptions | undefined,
        baseFont,
      );
    }
    allFonts.push(...deriveAllVariants(mainFont));
  }

  return deduplicateFonts(allFonts);
}
