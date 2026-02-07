// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type LayoutGap,
  type MeasuredLayoutNode,
  measureLayout,
  type MergedPageStyle,
  optimizeLayout,
  Padding,
  RectCoordsDims,
  renderContainerStyle,
  type RenderContext,
  walkLayout,
} from "../../deps.ts";
import { applyContainerDefaults } from "../../apply_container_defaults.ts";
import { itemMeasurer } from "./item_measurer.ts";
import { renderItem } from "./item_renderer.ts";
import type { FreeformPageInputs, PageContentItem } from "../../types.ts";

export interface MeasuredContent {
  rcdContentOuter: RectCoordsDims;
  rcdContentInner: RectCoordsDims;
  mLayout: MeasuredLayoutNode<PageContentItem>;
  overflow: boolean;
  gaps: LayoutGap[];
}

export function measureContent(
  rc: RenderContext,
  rcdOuter: RectCoordsDims,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
  headerHeight: number,
  footerHeight: number,
): MeasuredContent {
  const padContent = new Padding(s.content.padding);

  const rcdContentOuter = new RectCoordsDims([
    rcdOuter.x(),
    rcdOuter.y() + headerHeight,
    rcdOuter.w(),
    rcdOuter.h() - headerHeight - footerHeight,
  ]);

  const rcdContentInner = rcdContentOuter.getPadded(padContent);

  let measured: MeasuredLayoutNode<PageContentItem>;
  let overflow: boolean;
  let gaps: LayoutGap[];

  if (inputs.content.layoutType === "optimize") {
    // Optimize layout from items
    const optimized = optimizeLayout(
      { rc, s },
      inputs.content.items,
      rcdContentInner,
      s.content,
      itemMeasurer,
      (layout) => applyContainerDefaults(layout, s.layoutContainers),
      { constraint: inputs.content.constraint },
    );
    measured = optimized.measured;
    overflow = optimized.score.overflow > 0;
    gaps = [];
  } else {
    // Use provided layout
    const contentWithContainerDefaults = applyContainerDefaults(
      inputs.content.layout,
      s.layoutContainers,
    );

    const result = measureLayout(
      { rc, s },
      contentWithContainerDefaults,
      rcdContentInner,
      s.content.gapX,
      s.content.gapY,
      itemMeasurer,
      s.content.nColumns,
    );
    measured = result.measured;
    overflow = result.overflow;
    gaps = result.gaps;
  }

  return {
    rcdContentOuter,
    rcdContentInner,
    mLayout: measured,
    overflow,
    gaps,
  };
}

export function renderContent(
  rc: RenderContext,
  measured: MeasuredContent,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
): void {
  const padContent = new Padding(s.content.padding);

  // Note: Content background is painted once on the entire slide in render_freeform.ts
  // No need to paint it again here

  walkLayout(measured.mLayout, (node) => {
    renderContainerStyle(rc, node);
    if (node.type === "item") {
      renderItem(rc, node);
    }
  });

  if (inputs.pageNumber) {
    const mText = rc.mText(
      inputs.pageNumber,
      s.text.pageNumber,
      measured.rcdContentOuter.w() * 0.3,
    );
    rc.rText(
      mText,
      [
        measured.rcdContentOuter.getPadded(padContent).rightX(),
        measured.rcdContentOuter.getPadded(padContent).bottomY(),
      ],
      "right",
      "bottom",
    );
  }
}
