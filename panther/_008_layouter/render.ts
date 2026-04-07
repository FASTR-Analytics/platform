// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "./deps.ts";
import type { MeasuredLayoutNode } from "./types.ts";

export function renderContainerStyle(
  rc: RenderContext,
  node: MeasuredLayoutNode<unknown>,
): void {
  if (node.type !== "item") return;
  const rs = node.resolvedStyle;

  const hasBackground = rs.backgroundColor !== "none";
  const hasBorder = rs.borderColor !== "none" && rs.borderWidth > 0;

  if (hasBackground || hasBorder) {
    rc.rRect(node.styleRpd, {
      fillColor: hasBackground ? rs.backgroundColor : "transparent",
      strokeColor: hasBorder ? rs.borderColor : undefined,
      strokeWidth: hasBorder ? rs.borderWidth : undefined,
      rectRadius: rs.rectRadius > 0 ? rs.rectRadius : undefined,
    });
  }

  // if (rs.decoration?.type === "quote") {
  //   const d = rs.decoration;
  //   const ti: TextInfoUnkeyed = {
  //     font: d.font,
  //     fontSize: d.size,
  //     color: d.color,
  //     lineHeight: 1,
  //     lineBreakGap: "none",
  //     letterSpacing: "0px",
  //   };
  //   const mQuote = rc.mText("\u201C", ti, 9999);
  //   const decoX = node.contentRpd.x();
  //   const decoY = node.rpd.y() + rs.borderWidth + d.topMargin;
  //   rc.rText(mQuote, { x: decoX, y: decoY }, "left", "top");
  // }
}
