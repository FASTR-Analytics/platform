// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "../deps.ts";
import type { PagePrimitive } from "../types.ts";

export function renderPagePrimitives(
  rc: RenderContext,
  primitives: PagePrimitive[],
): void {
  for (const prim of primitives) {
    switch (prim.type) {
      case "background":
        rc.rRect(prim.rcd, { fillColor: prim.fillColor });
        break;
      case "text":
        rc.rText(prim.mText, [prim.x, prim.y], prim.hAlign, prim.vAlign);
        break;
      case "image":
        rc.rImage(
          prim.image,
          prim.rcd.x(),
          prim.rcd.y(),
          prim.rcd.w(),
          prim.rcd.h(),
        );
        break;
      case "line":
        rc.rLine(prim.points, prim.style);
        break;
      default: {
        const _exhaustive: never = prim;
        throw new Error(
          `Unknown primitive type: ${(_exhaustive as PagePrimitive).type}`,
        );
      }
    }
  }
}
