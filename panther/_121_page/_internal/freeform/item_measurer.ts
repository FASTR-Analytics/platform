// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  FigureRenderer,
  ImageRenderer,
  type ItemLayoutNode,
  type ItemSizeMeasurer,
  MarkdownRenderer,
  type SizeConstraints,
} from "../../deps.ts";
import {
  isSpacerItem,
  type PageContentItem,
  type PageRenderContext,
} from "../../types.ts";
import { withFontFloor } from "./font_floor.ts";

// Measures with the page's font floor, so a layout the optimizer scores from
// the caller's items is measured as the page draws them.
export const itemMeasurer: ItemSizeMeasurer<
  PageRenderContext,
  PageContentItem
> = (
  src,
  node: ItemLayoutNode<PageContentItem>,
  width,
): SizeConstraints => {
  const item = withFontFloor(node.data, src.s.content.minFontSize);

  if (MarkdownRenderer.isType(item)) {
    return MarkdownRenderer.getIdealHeight(src.rc, width, item);
  }

  if (FigureRenderer.isType(item)) {
    const hc = FigureRenderer.getIdealHeight(src.rc, width, item);
    // Stretch beyond ideal is a page policy, not a figure property. A figure
    // that resists stretching reports a finite maxH (= its ideal); the page
    // grants it up to figureMaxStretch × ideal to fill space. A figure that
    // fills freely reports Infinity and is left uncapped.
    const maxH = Number.isFinite(hc.maxH)
      ? hc.idealH * src.s.content.figureMaxStretch
      : hc.maxH;
    return { ...hc, maxH };
  }

  if (ImageRenderer.isType(item)) {
    return ImageRenderer.getIdealHeight(src.rc, width, item);
  }

  if (isSpacerItem(item)) {
    const minH = item.minH ?? 0;
    const maxH = item.maxH ?? Infinity;
    const idealH = minH;
    return { minH, idealH, maxH, minW: 0, neededScalingToFitWidth: "none" };
  }

  throw new Error("No measurer for item type");
};
