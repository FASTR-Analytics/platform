// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createCachedMeasurer,
  type LayoutGap,
  type LayoutStyleConfig,
  type MeasuredLayoutNode,
  measureLayout,
  type MergedFreeformStyle,
  type RectCoordsDims,
  renderContainerStyle,
  type RenderContext,
  walkLayout,
} from "../../deps.ts";
import { itemMeasurer } from "./item_measurer.ts";
import { renderItem } from "./item_renderer.ts";
import type { FreeformPageInputs, PageContentItem } from "../../types.ts";

export type MeasuredContent = {
  mLayout: MeasuredLayoutNode<PageContentItem>;
  overflow: boolean;
  gaps: LayoutGap[];
};

export function measureContent(
  rc: RenderContext,
  rcdContentInner: RectCoordsDims,
  inputs: FreeformPageInputs,
  s: MergedFreeformStyle,
): MeasuredContent {
  const layoutStyle: LayoutStyleConfig = {
    gapX: s.content.gapX,
    gapY: s.content.gapY,
    containerDefaults: {
      ...s.layoutContainers,
      backgroundExtent: "content" as const,
    },
    alreadyScaledValue: s.alreadyScaledValue,
  };

  const result = measureLayout(
    { rc, s },
    inputs.content,
    rcdContentInner,
    layoutStyle,
    createCachedMeasurer(itemMeasurer),
  );

  return {
    mLayout: result.measured,
    overflow: result.overflow,
    gaps: result.gaps,
  };
}

export function renderContent(
  rc: RenderContext,
  mLayout: MeasuredLayoutNode<PageContentItem>,
): void {
  walkLayout(mLayout, (node) => {
    renderContainerStyle(rc, node);
    if (node.type === "item") {
      renderItem(rc, node);
    }
  });
}
