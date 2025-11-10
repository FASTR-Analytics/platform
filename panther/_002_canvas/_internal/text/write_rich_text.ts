// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MeasuredRichText } from "../../deps.ts";
import { setCtxFont } from "./set_ctx_font.ts";

export function writeRichText(
  ctx: CanvasRenderingContext2D,
  mRichText: MeasuredRichText,
  x: number,
  y: number,
  align: "center" | "left" | "right",
) {
  mRichText.lines.forEach((line) => {
    // Calculate x offset based on alignment
    let xOffset = 0;
    if (align === "center") {
      xOffset = -line.totalWidth / 2;
    } else if (align === "right") {
      xOffset = -line.totalWidth;
    }

    // Render each segment in the line
    line.segments.forEach((segment) => {
      setCtxFont(ctx, segment.ti, "left"); // Always use left align for segments
      ctx.fillText(segment.text, x + xOffset + segment.x, y + line.y);
    });
  });
}

export function writeVerticalRichText(
  ctx: CanvasRenderingContext2D,
  mRichText: MeasuredRichText,
  x: number,
  y: number,
  verticalAlign: "top" | "center" | "bottom",
  horizontalAlign: "left" | "center" | "right",
) {
  const rotation = mRichText.rotation;
  const align2 = rotation === "anticlockwise"
    ? verticalAlign === "top"
      ? "right"
      : verticalAlign === "bottom"
      ? "left"
      : "center"
    : verticalAlign === "top"
    ? "left"
    : verticalAlign === "bottom"
    ? "right"
    : "center";

  const angle = rotation === "anticlockwise" ? -0.5 : 0.5;

  const y2 = rotation === "anticlockwise"
    ? horizontalAlign === "left"
      ? 0
      : horizontalAlign === "center"
      ? (0 - mRichText.dims.w()) / 2
      : 0 - mRichText.dims.w()
    : horizontalAlign === "left"
    ? 0 - mRichText.dims.w()
    : horizontalAlign === "center"
    ? (0 - mRichText.dims.w()) / 2
    : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI * angle);

  mRichText.lines.forEach((line) => {
    // Calculate x offset based on alignment for rotated text
    let xOffset = 0;
    if (align2 === "center") {
      xOffset = -line.totalWidth / 2;
    } else if (align2 === "right") {
      xOffset = -line.totalWidth;
    }

    // Render each segment in the line
    line.segments.forEach((segment) => {
      if (segment.text === "HIDE_THIS") {
        return;
      }

      setCtxFont(ctx, segment.ti, "left"); // Always use left align for segments
      ctx.fillText(segment.text, xOffset + segment.x, y2 + line.y);
    });
  });

  ctx.restore();
}
