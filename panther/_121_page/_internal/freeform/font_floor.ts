// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  FigureRenderer,
  type LayoutNode,
  MarkdownRenderer,
} from "../../deps.ts";
import type { PageContentItem } from "../../types.ts";

// An item with the page's floor as its autofit floor. An item whose autofit
// names its own floor, or is off, keeps it, and is returned as it is.
export function withFontFloor(
  item: PageContentItem,
  minFontSize: number,
): PageContentItem {
  if (MarkdownRenderer.isType(item)) {
    const { autofit } = item;
    if (
      autofit === false ||
      typeof autofit === "object" && autofit.minFontSize !== undefined
    ) {
      return item;
    }
    return {
      ...item,
      autofit: { ...(typeof autofit === "object" ? autofit : {}), minFontSize },
    };
  }
  if (FigureRenderer.isType(item)) {
    const { autofit } = item;
    if (
      autofit === false ||
      typeof autofit === "object" && autofit.minFontSizeDu !== undefined
    ) {
      return item;
    }
    return {
      ...item,
      autofit: {
        ...(typeof autofit === "object" ? autofit : {}),
        minFontSizeDu: minFontSize,
      },
    };
  }
  return item;
}

export function withPageFontFloor(
  node: LayoutNode<PageContentItem>,
  minFontSize: number,
): LayoutNode<PageContentItem> {
  return node.type === "item"
    ? { ...node, data: withFontFloor(node.data, minFontSize) }
    : {
      ...node,
      children: node.children.map((child) =>
        withPageFontFloor(child, minFontSize)
      ),
    };
}
