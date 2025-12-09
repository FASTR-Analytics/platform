// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { quotedFontFamilyForCanvas } from "../../deps.ts";
import type { TextInfoUnkeyed } from "../../deps.ts";

export function setCtxFont(
  ctx: CanvasRenderingContext2D,
  ti: TextInfoUnkeyed,
  align: "center" | "left" | "right" | undefined,
) {
  const quotedFamily = quotedFontFamilyForCanvas(ti.font.fontFamily);

  let fontString: string;
  if (ti.font.italic) {
    fontString = `italic ${ti.font.weight} ${ti.fontSize}px ${quotedFamily}`;
  } else {
    fontString = `${ti.font.weight} ${ti.fontSize}px ${quotedFamily}`;
  }

  ctx.font = fontString;
  if (ti.color !== "none") {
    ctx.fillStyle = ti.color;
  }
  try {
    // @ts-ignore - letterSpacing not in all CanvasRenderingContext2D type versions
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
