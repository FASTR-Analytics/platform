// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  FigureRenderer,
  ImageRenderer,
  type ItemHeightMeasurer,
  type ItemIdealHeightInfo,
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
): ItemIdealHeightInfo => {
  const item = node.data;

  if (MarkdownRenderer.isType(item)) {
    const idealH = MarkdownRenderer.getIdealHeight(src.rc, width, item);
    return { idealH };
  }

  if (FigureRenderer.isType(item)) {
    const idealH = FigureRenderer.getIdealHeight(src.rc, width, item);
    return { idealH };
  }

  if (ImageRenderer.isType(item)) {
    const idealH = ImageRenderer.getIdealHeight(src.rc, width, item);
    return { idealH };
  }

  if (isSpacerItem(item)) {
    return { idealH: item.spacerHeight };
  }

  throw new Error("No measurer for item type");
};
