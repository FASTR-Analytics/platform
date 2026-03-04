// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AlignH, AlignV, MeasuredText } from "../../deps.ts";
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
  alignV: AlignV,
  alignH: AlignH,
) {
  const rotation = mText.rotation;
  const align2 = rotation === "anticlockwise"
    ? alignV === "top" ? "right" : alignV === "bottom" ? "left" : "center"
    : alignV === "top"
    ? "left"
    : alignV === "bottom"
    ? "right"
    : "center";

  const angle = rotation === "anticlockwise" ? -0.5 : 0.5;

  const y2 = rotation === "anticlockwise"
    ? alignH === "left"
      ? 0
      : alignH === "center"
      ? (0 - mText.dims.w()) / 2
      : 0 - mText.dims.w()
    : alignH === "left"
    ? 0 - mText.dims.w()
    : alignH === "center"
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
