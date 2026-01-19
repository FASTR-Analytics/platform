// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  FigureRenderer,
  type HeightConstraints,
  ImageRenderer,
  type ItemHeightMeasurer,
  type ItemLayoutNode,
  MarkdownRenderer,
} from "../../deps.ts";
import {
  isSpacerItem,
  type PageContentItem,
  type PageRenderContext,
} from "../../types.ts";

export const itemMeasurer: ItemHeightMeasurer<
  PageRenderContext,
  PageContentItem
> = (
  src,
  node: ItemLayoutNode<PageContentItem>,
  width,
): HeightConstraints => {
  const item = node.data;
  const minFigureHeight = src.s.content.gapY * 3;

  if (MarkdownRenderer.isType(item)) {
    const h = MarkdownRenderer.getIdealHeight(src.rc, width, item);
    return { minH: h, idealH: h, maxH: h };
  }

  if (FigureRenderer.isType(item)) {
    const idealH = FigureRenderer.getIdealHeight(src.rc, width, item);
    return { minH: minFigureHeight, idealH, maxH: Infinity };
  }

  if (ImageRenderer.isType(item)) {
    const idealH = ImageRenderer.getIdealHeight(src.rc, width, item);
    return { minH: minFigureHeight, idealH, maxH: Infinity };
  }

  if (isSpacerItem(item)) {
    const minH = item.minH ?? minFigureHeight;
    const maxH = item.maxH ?? Infinity;
    const idealH = minH;
    return { minH, idealH, maxH };
  }

  throw new Error("No measurer for item type");
};
