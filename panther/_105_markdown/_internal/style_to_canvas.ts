// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  getColor,
  getFont,
  type MarkdownLinkStyle,
  type MarkdownTextStyle,
  type TextInfoUnkeyed,
} from "../deps.ts";

export function markdownTextStyleToTextInfo(
  textStyle: MarkdownTextStyle,
): TextInfoUnkeyed {
  return {
    font: getFont(textStyle.font),
    fontSize: textStyle.fontSize,
    color: getColor(textStyle.color),
    lineHeight: textStyle.lineHeight,
    letterSpacing: "0px",
    lineBreakGap: "none",
    fontVariants: textStyle.fontVariants
      ? {
        bold: textStyle.fontVariants.bold
          ? getFont(textStyle.fontVariants.bold)
          : undefined,
        italic: textStyle.fontVariants.italic
          ? getFont(textStyle.fontVariants.italic)
          : undefined,
        boldAndItalic: textStyle.fontVariants.boldAndItalic
          ? getFont(textStyle.fontVariants.boldAndItalic)
          : undefined,
      }
      : undefined,
  };
}

export function applyLinkStyleToTextInfo(
  baseTextInfo: TextInfoUnkeyed,
  linkStyle: MarkdownLinkStyle,
): TextInfoUnkeyed {
  return {
    ...baseTextInfo,
    color: getColor(linkStyle.color),
  };
}
