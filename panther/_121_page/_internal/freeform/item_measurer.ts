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

  if (MarkdownRenderer.isType(item)) {
    return MarkdownRenderer.getIdealHeight(src.rc, width, item);
  }

  if (FigureRenderer.isType(item)) {
    return FigureRenderer.getIdealHeight(src.rc, width, item);
  }

  if (ImageRenderer.isType(item)) {
    return ImageRenderer.getIdealHeight(src.rc, width, item);
  }

  if (isSpacerItem(item)) {
    const minH = item.minH ?? 0;
    const maxH = item.maxH ?? Infinity;
    const idealH = minH;
    return { minH, idealH, maxH, neededScalingToFitWidth: "none" };
  }

  throw new Error("No measurer for item type");
};
