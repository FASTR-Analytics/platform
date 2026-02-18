// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomPageStyle,
  type CustomPageStyleOptions,
  generateCandidates,
  type ItemLayoutNode,
  type LayoutNode,
  type LayoutStyleConfig,
  type OptimizerConfig,
  Padding,
  pickBestLayout,
  type RectCoordsDims,
  type RenderContext,
  type ScoredLayout,
  scoreLayouts,
} from "./deps.ts";
import { itemMeasurer } from "./_internal/freeform/item_measurer.ts";
import type { PageContentItem } from "./types.ts";

export type OptimizePageLayoutResult = {
  best: ScoredLayout<PageContentItem>;
  candidates: LayoutNode<PageContentItem>[];
  scored: ScoredLayout<PageContentItem>[];
};

export function optimizePageLayout(
  rc: RenderContext,
  bounds: RectCoordsDims,
  itemNodes: ItemLayoutNode<PageContentItem>[],
  style?: CustomPageStyleOptions,
  responsiveScale?: number,
  config?: OptimizerConfig,
): OptimizePageLayoutResult {
  const s = new CustomPageStyle(style, responsiveScale).getMergedPageStyle();

  const padContent = new Padding(s.content.padding);
  const contentBounds = bounds.getPadded(padContent);

  const layoutStyle: LayoutStyleConfig = {
    gapX: s.content.gapX,
    gapY: s.content.gapY,
    containerDefaults: s.layoutContainers,
    alreadyScaledValue: s.alreadyScaledValue,
  };

  const candidates = generateCandidates(itemNodes, config);
  const scored = scoreLayouts(
    { rc, s },
    candidates,
    contentBounds,
    layoutStyle,
    itemMeasurer,
  );
  const best = pickBestLayout(scored);
  return { best, candidates, scored };
}
