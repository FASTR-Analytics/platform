// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MeasuredText } from "../../deps.ts";
import { setCtxFont } from "./set_ctx_font.ts";

export function writeText(
  ctx: CanvasRenderingContext2D,
  mText: MeasuredText,
  x: number,
  y: number,
  align: "center" | "left" | "right",
) {
  setCtxFont(ctx, mText.ti, align);
  mText.lines.forEach((line) => {
    ctx.fillText(line.text, x, y + line.y);
  });
}

export function writeVerticalText(
  ctx: CanvasRenderingContext2D,
  mText: MeasuredText,
  x: number,
  y: number,
  verticalAlign: "top" | "center" | "bottom",
  horizontalAlign: "left" | "center" | "right",
) {
  const rotation = mText.rotation;
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
      ? (0 - mText.dims.w()) / 2
      : 0 - mText.dims.w()
    : horizontalAlign === "left"
    ? 0 - mText.dims.w()
    : horizontalAlign === "center"
    ? (0 - mText.dims.w()) / 2
    : 0;

  setCtxFont(ctx, mText.ti, align2);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI * angle);
  mText.lines.forEach((line) => {
    ctx.fillText(line.text, 0, y2 + line.y);
  });
  ctx.restore();
}
