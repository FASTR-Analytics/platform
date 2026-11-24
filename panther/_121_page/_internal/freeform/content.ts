// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createCachedMeasurer,
  type LayoutGap,
  type LayoutOverflowCause,
  type LayoutStyleConfig,
  type MeasuredLayoutNode,
  measureLayout,
  type MergedFreeformStyle,
  type RectCoordsDims,
  renderContainerStyle,
  type RenderContext,
  walkLayout,
} from "../../deps.ts";
import { withPageFontFloor } from "./font_floor.ts";
import { itemMeasurer } from "./item_measurer.ts";
import { renderItem } from "./item_renderer.ts";
import type { FreeformPageInputs, PageContentItem } from "../../types.ts";

export type MeasuredContent = {
  mLayout: MeasuredLayoutNode<PageContentItem>;
  overflowCauses: LayoutOverflowCause[];
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
    containerDefaults: s.layoutContainers,
    alreadyScaledValue: s.alreadyScaledValue,
  };

  // The measured layout's items carry the floor, so every drawing of the page
  // reads the inputs the layout measured.
  const result = measureLayout(
    { rc, s },
    withPageFontFloor(inputs.content, s.content.minFontSize),
    rcdContentInner,
    layoutStyle,
    createCachedMeasurer(itemMeasurer),
  );

  return {
    mLayout: result.measured,
    overflowCauses: result.overflowCauses,
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
