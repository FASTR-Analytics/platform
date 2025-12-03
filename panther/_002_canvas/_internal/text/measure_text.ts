// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Dimensions,
  type MeasuredText,
  type MeasuredTextLine,
  type TextInfoUnkeyed,
} from "../../deps.ts";
import type { TextRenderingOptions } from "../../text_rendering_options.ts";
import { setCtxFont } from "./set_ctx_font.ts";
import { findBestFontForText } from "./detect_char_support.ts";

export function measureText(
  ctx: CanvasRenderingContext2D,
  text: string,
  ti: TextInfoUnkeyed,
  maxWidth: number,
  textRenderingOptions?: TextRenderingOptions,
): MeasuredText {
  if (text === "") {
    return {
      lines: [],
      dims: new Dimensions({ w: 0, h: 0 }),
      ti,
      rotation: "horizontal",
    };
  }

  // Special case: single space character (used by formatted text systems)
  if (text === " ") {
    setCtxFont(ctx, ti, undefined);
    const metrics = ctx.measureText(" ");
    const ascent = metrics.fontBoundingBoxAscent ?? 0;
    const descent = metrics.fontBoundingBoxDescent ?? 0;
    return {
      lines: [{ text: " ", w: metrics.width, y: ascent }],
      dims: new Dimensions({ w: metrics.width, h: ascent + descent }),
      ti,
      rotation: "horizontal",
    };
  }

  if (!text.trim()) {
    return {
      lines: [],
      dims: new Dimensions({ w: 0, h: 0 }),
      ti,
      rotation: "horizontal",
    };
  }

  // Find best font if character support checking is enabled
  let effectiveTi = ti;
  if (
    textRenderingOptions?.checkCharSupport &&
    textRenderingOptions.fallbackFonts.length > 0
  ) {
    const bestFont = findBestFontForText(
      text,
      ti.font,
      textRenderingOptions.fallbackFonts,
    );
    effectiveTi = {
      ...ti,
      font: bestFont,
    };
  }

  setCtxFont(ctx, effectiveTi, undefined);
  const extraForLineHeight = (effectiveTi.lineHeight / 1.2 - 1) *
    effectiveTi.fontSize;
  const extraForLineBreaks = ti.lineBreakGap === "none"
    ? 0
    : ti.lineBreakGap * effectiveTi.fontSize * effectiveTi.lineHeight;
  const lines: MeasuredTextLine[] = [];

  const rawLines = text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  let currentY = 0;
  let overallMaxWidth = 0;

  for (const rawLine of rawLines) {
    const words = rawLine
      .split(" ")
      .map((t) => t.trim())
      .filter(Boolean);

    let currentLine = "";
    let testLine = "";
    let currentW = 0;

    for (let i = 0; i < words.length; i++) {
      testLine += `${words[i]} `;
      const metrics = ctx.measureText(testLine.trim());
      const testWidth = metrics.width;
      const fontBoundingBoxAscent = metrics.fontBoundingBoxAscent;
      const fontBoundingBoxDescent = metrics.fontBoundingBoxDescent;
      if (
        fontBoundingBoxAscent === undefined ||
        fontBoundingBoxDescent === undefined
      ) {
        throw new Error("This renderer doesn't support text metrics");
      }
      if (testWidth > maxWidth && i > 0) {
        currentY += fontBoundingBoxAscent;
        lines.push({
          text: currentLine.trim(),
          w: currentW,
          y: currentY,
        });
        overallMaxWidth = Math.max(overallMaxWidth, currentW);
        currentY += fontBoundingBoxDescent + extraForLineHeight;
        currentLine = `${words[i]} `;
        testLine = `${words[i]} `;
        currentW = ctx.measureText(currentLine.trim()).width;
      } else {
        currentLine = testLine;
        currentW = testWidth;
        overallMaxWidth = Math.max(overallMaxWidth, testWidth);
      }
      if (i === words.length - 1) {
        currentY += fontBoundingBoxAscent;
        lines.push({
          text: currentLine.trim(),
          w: currentW,
          y: currentY,
        });
        overallMaxWidth = Math.max(overallMaxWidth, currentW);
        currentY += fontBoundingBoxDescent + extraForLineHeight;
      }
    }
    currentY += extraForLineBreaks;
  }
  currentY -= extraForLineHeight;
  currentY -= extraForLineBreaks;
  return {
    lines,
    dims: new Dimensions({ w: overallMaxWidth, h: Math.round(currentY) }),
    ti: effectiveTi,
    rotation: "horizontal",
  };
}

export function measureVerticalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  ti: TextInfoUnkeyed,
  maxHeight: number,
  rotation: "anticlockwise" | "clockwise",
  textRenderingOptions?: TextRenderingOptions,
): MeasuredText {
  const m = measureText(ctx, text, ti, maxHeight, textRenderingOptions);
  return {
    lines: m.lines,
    dims: m.dims.getTransposed(), // Note this
    ti,
    rotation,
  };
}
