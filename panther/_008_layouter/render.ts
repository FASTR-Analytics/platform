// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Padding, type RenderContext } from "./deps.ts";
import type { MeasuredLayoutNode } from "./types.ts";

export function renderContainerStyle(
  rc: RenderContext,
  node: MeasuredLayoutNode<unknown>,
): void {
  if (node.type !== "item") return;
  const rs = node.resolvedStyle;

  const hasBackground = rs.backgroundColor !== "none";
  const hasBorder = rs.borderColor !== "none" && rs.borderWidth > 0;

  if (!hasBackground && !hasBorder) return;

  const inset = rs.borderWidth / 2;
  const insetPad = new Padding(inset);
  const renderBounds = node.rpd.getPadded(insetPad);

  rc.rRect(renderBounds, {
    fillColor: hasBackground ? rs.backgroundColor : "transparent",
    strokeColor: hasBorder ? rs.borderColor : undefined,
    strokeWidth: hasBorder ? rs.borderWidth : undefined,
  });
}
