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
  resolveFigureAutofitOptions,
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
    // Apply scale only when autofit is enabled and scale < 1.0
    let responsiveScale: number | undefined;
    const autofitOpts = resolveFigureAutofitOptions(item.autofit);
    if (autofitOpts && typeof node.neededScalingToFitWidth === "number") {
      if (node.neededScalingToFitWidth < 1.0) {
        responsiveScale = node.neededScalingToFitWidth;
      }
    }
    FigureRenderer.measureAndRender(rc, rcd, item, responsiveScale);
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
