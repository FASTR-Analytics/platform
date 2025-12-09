// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getColor, Padding, type RenderContext } from "./deps.ts";
import type { MeasuredLayoutNode } from "./types.ts";

/**
 * Optional utility to render container background/border styles.
 * Use this within a walkLayout visitor if you want container styling.
 *
 * Border is drawn fully inside the container bounds (not straddling the edge).
 * Box model: bounds -> border (inside) -> padding -> content
 */
export function renderContainerStyle(
  rc: RenderContext,
  node: MeasuredLayoutNode<unknown>,
): void {
  const style = node.style;
  if (!style) return;

  const hasBackground = style.backgroundColor &&
    style.backgroundColor !== "none";
  const hasBorder = style.borderColor && style.borderWidth &&
    style.borderWidth > 0;

  if (!hasBackground && !hasBorder) return;

  // Inset by half border width so stroke is drawn fully inside bounds
  const borderWidth = style.borderWidth ?? 0;
  const inset = borderWidth / 2;
  const insetPad = new Padding(inset);
  const renderBounds = node.rpd.getPadded(insetPad);

  rc.rRect(renderBounds, {
    fillColor: hasBackground ? getColor(style.backgroundColor!) : "transparent",
    strokeColor: hasBorder ? getColor(style.borderColor!) : undefined,
    strokeWidth: hasBorder ? borderWidth : undefined,
  });
}
