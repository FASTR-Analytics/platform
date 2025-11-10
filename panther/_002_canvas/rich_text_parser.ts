// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RichText, RichTextSegment, TextInfoUnkeyed } from "./deps.ts";

export function parseRichText(
  text: string,
  baseStyle: TextInfoUnkeyed,
): RichText {
  const segments: RichTextSegment[] = [];

  // Regular expression to match bold (** or __), italic (* or _), or bold italic (*** or ___) with escaping support
  const regex = /(\*{1,3}|_{1,3})((?:[^*_\\]|\\[*_])+?)(\1)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match as plain text
    if (match.index > lastIndex) {
      const plainText = text.slice(lastIndex, match.index);
      if (plainText) {
        segments.push({
          text: unescapeText(plainText),
        });
      }
    }

    // Determine the style based on the markers
    const marker = match[1];
    const content = match[2];
    const style: RichTextSegment["style"] = {};

    if (marker === "***" || marker === "___") {
      style.bold = true;
      style.italic = true;
    } else if (marker === "**" || marker === "__") {
      style.bold = true;
    } else if (marker === "*" || marker === "_") {
      style.italic = true;
    }

    segments.push({
      text: unescapeText(content),
      style,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      segments.push({
        text: unescapeText(remainingText),
      });
    }
  }

  // If no segments were created, treat the entire text as plain
  if (segments.length === 0 && text) {
    segments.push({
      text: unescapeText(text),
    });
  }

  return {
    segments,
    baseStyle,
  };
}

function unescapeText(text: string): string {
  return text.replace(/\\([*_])/g, "$1");
}

export function applyStyleToTextInfo(
  baseStyle: TextInfoUnkeyed,
  style?: RichTextSegment["style"],
): TextInfoUnkeyed {
  if (!style) {
    return baseStyle;
  }

  // Check for font variants first
  if (style.bold && style.italic && baseStyle.fontVariants?.boldAndItalic) {
    return {
      ...baseStyle,
      font: baseStyle.fontVariants.boldAndItalic,
    };
  }

  if (style.bold && !style.italic && baseStyle.fontVariants?.bold) {
    return {
      ...baseStyle,
      font: baseStyle.fontVariants.bold,
    };
  }

  if (style.italic && !style.bold && baseStyle.fontVariants?.italic) {
    return {
      ...baseStyle,
      font: baseStyle.fontVariants.italic,
    };
  }

  // Fallback to current behavior if no variants specified
  const newFont = { ...baseStyle.font };

  if (style.bold) {
    // If base weight is 400 or less, make it 700
    // If base weight is already bold (500+), make it even bolder (up to 900)
    newFont.weight = baseStyle.font.weight <= 400 ? 700 : Math.min(
      900,
      baseStyle.font.weight + 200,
    ) as TextInfoUnkeyed["font"]["weight"];
  }

  if (style.italic) {
    newFont.italic = true;
  }

  return {
    ...baseStyle,
    font: newFont,
  };
}
