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
import { setCtxFont } from "./set_ctx_font.ts";

export function measureText(
  ctx: CanvasRenderingContext2D,
  text: string,
  ti: TextInfoUnkeyed,
  maxWidth: number,
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
    const spaceWidth = metrics.width; // Single char, no kerning issue
    const ascent = metrics.fontBoundingBoxAscent ?? 0;
    const descent = metrics.fontBoundingBoxDescent ?? 0;
    return {
      lines: [{ text: " ", w: spaceWidth, y: ascent }],
      dims: new Dimensions({ w: spaceWidth, h: ascent + descent }),
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

  setCtxFont(ctx, ti, undefined);
  const extraForLineHeight = (ti.lineHeight / 1.2 - 1) * ti.fontSize;
  const extraForLineBreaks = ti.lineBreakGap === "none"
    ? 0
    : ti.lineBreakGap * ti.fontSize * ti.lineHeight;
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
      const trimmedTestLine = testLine.trim();
      const metrics = ctx.measureText(trimmedTestLine);
      const testWidth = ctx.measureText(trimmedTestLine).width;
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
    ti,
    rotation: "horizontal",
  };
}

export function measureVerticalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  ti: TextInfoUnkeyed,
  maxHeight: number,
  rotation: "anticlockwise" | "clockwise",
): MeasuredText {
  const m = measureText(ctx, text, ti, maxHeight);
  return {
    lines: m.lines,
    dims: m.dims.getTransposed(), // Note this
    ti,
    rotation,
  };
}
