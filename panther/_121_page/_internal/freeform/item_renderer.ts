// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  FigureRenderer,
  ImageRenderer,
  MarkdownRenderer,
  type MeasuredLayoutNode,
  type RenderContext,
} from "../../deps.ts";
import { isSpacerItem, type PageContentItem } from "../../types.ts";

export function renderItem(
  rc: RenderContext,
  node: MeasuredLayoutNode<PageContentItem> & { type: "item" },
): void {
  const item = node.data;
  const rcd = node.rpd;

  if (MarkdownRenderer.isType(item)) {
    MarkdownRenderer.measureAndRender(rc, rcd, item);
    return;
  }

  if (FigureRenderer.isType(item)) {
    FigureRenderer.measureAndRender(rc, rcd, item);
    return;
  }

  if (ImageRenderer.isType(item)) {
    ImageRenderer.measureAndRender(rc, rcd, item);
    return;
  }

  if (isSpacerItem(item)) {
    return;
  }

  throw new Error("No renderer for item type");
}
