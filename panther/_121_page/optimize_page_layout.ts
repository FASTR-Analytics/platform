// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createCachedMeasurer,
  CustomPageStyle,
  type CustomPageStyleOptions,
  generateCandidates,
  type ItemLayoutNode,
  type LayoutNode,
  type LayoutStyleConfig,
  type OptimizerConfig,
  pickBestLayout,
  type RectCoordsDims,
  type RenderContext,
  type ScoredLayout,
  scoreLayouts,
} from "./deps.ts";
import { measureContentBox } from "./_internal/freeform/content_box.ts";
import { itemMeasurer } from "./_internal/freeform/item_measurer.ts";
import { computeSplitBounds } from "./_internal/split_bounds.ts";
import type { HeaderFooterInputs, PageContentItem } from "./types.ts";

export type OptimizePageLayoutResult = {
  best: ScoredLayout<PageContentItem>;
  candidates: LayoutNode<PageContentItem>[];
  scored: ScoredLayout<PageContentItem>[];
};

// Candidates are scored in the box the renderer gives the layout: the split
// and the chrome come off first, through the functions measurePage and
// measureFreeform use, so score.overflow agrees with the measured page.
export function optimizePageLayout(
  rc: RenderContext,
  bounds: RectCoordsDims,
  itemNodes: ItemLayoutNode<PageContentItem>[],
  chrome: HeaderFooterInputs,
  style?: CustomPageStyleOptions,
  config?: OptimizerConfig,
): OptimizePageLayoutResult {
  const s = new CustomPageStyle(style).getMergedFreeformStyle();

  const pageBounds = s.split.placement === "none"
    ? bounds
    : computeSplitBounds(bounds, s.split).contentBounds;
  const contentBounds = measureContentBox(rc, pageBounds, chrome, s)
    .rcdContentInner;

  const layoutStyle: LayoutStyleConfig = {
    gapX: s.content.gapX,
    gapY: s.content.gapY,
    containerDefaults: {
      ...s.layoutContainers,
      backgroundExtent: "content" as const,
    },
    alreadyScaledValue: s.alreadyScaledValue,
  };

  const cachedMeasurer = createCachedMeasurer(itemMeasurer);
  const candidates = generateCandidates(itemNodes, config);
  const scored = scoreLayouts(
    { rc, s },
    candidates,
    contentBounds,
    layoutStyle,
    cachedMeasurer,
  );
  const best = pickBestLayout(scored);
  return { best, candidates, scored };
}
