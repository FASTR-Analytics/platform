// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { TextInfoUnkeyed } from "../../deps.ts";

export function setCtxFont(
  ctx: CanvasRenderingContext2D,
  ti: TextInfoUnkeyed,
  align: "center" | "left" | "right" | undefined,
) {
  if (ti.font.italic) {
    ctx.font =
      `italic ${ti.font.weight} ${ti.fontSize}px ${ti.font.fontFamily}`;
  } else {
    ctx.font = `${ti.font.weight} ${ti.fontSize}px ${ti.font.fontFamily}`;
  }
  if (ti.color !== "none") {
    ctx.fillStyle = ti.color;
  }
  try {
    ctx.letterSpacing = ti.letterSpacing;
  } catch {
    if (ti.letterSpacing !== "0px") {
      console.warn("This renderer does not support letterSpacing");
    }
  }
  if (align) {
    ctx.textAlign = align;
  } else {
    ctx.textAlign = "left";
  }
  ctx.textBaseline = "alphabetic";
}
