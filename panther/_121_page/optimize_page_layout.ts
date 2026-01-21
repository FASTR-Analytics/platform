// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createItemNode,
  CustomPageStyle,
  type CustomPageStyleOptions,
  type LayoutNode,
  optimizeLayout,
  type OptimizerConstraint,
  type OptimizeResult,
  Padding,
  type RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import { applyContainerDefaults } from "./apply_container_defaults.ts";
import { itemMeasurer } from "./_internal/freeform/item_measurer.ts";
import type { PageContentItem } from "./types.ts";

export type OptimizePageLayoutResult = OptimizeResult<PageContentItem>;

export function optimizePageLayout(
  rc: RenderContext,
  bounds: RectCoordsDims,
  items: PageContentItem[],
  style?: CustomPageStyleOptions,
  responsiveScale?: number,
  constraint?: OptimizerConstraint,
): OptimizePageLayoutResult {
  const s = new CustomPageStyle(style, responsiveScale).getMergedPageStyle();

  // Calculate content bounds (same as measureContent does)
  const padContent = new Padding(s.content.padding);
  const contentBounds = bounds.getPadded(padContent);

  // Wrap items in ItemLayoutNodes
  const itemNodes = items.map((item) => createItemNode(item));

  // Call the generic optimizer with container defaults transform
  return optimizeLayout(
    { rc, s },
    itemNodes,
    contentBounds,
    s.content,
    itemMeasurer,
    (layout: LayoutNode<PageContentItem>) =>
      applyContainerDefaults(layout, s.layoutContainers),
    { constraint },
  );
}
