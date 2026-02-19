// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type LayoutGap,
  type LayoutStyleConfig,
  type MeasuredLayoutNode,
  measureLayout,
  type MergedPageStyle,
  Padding,
  RectCoordsDims,
  renderContainerStyle,
  type RenderContext,
  walkLayout,
} from "../../deps.ts";
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

  const layoutStyle: LayoutStyleConfig = {
    gapX: s.content.gapX,
    gapY: s.content.gapY,
    containerDefaults: s.layoutContainers,
    alreadyScaledValue: s.alreadyScaledValue,
  };

  const result = measureLayout(
    { rc, s },
    inputs.content,
    rcdContentInner,
    layoutStyle,
    itemMeasurer,
  );

  return {
    rcdContentOuter,
    rcdContentInner,
    mLayout: result.measured,
    overflow: result.overflow,
    gaps: result.gaps,
  };
}

export function renderContent(
  rc: RenderContext,
  measured: MeasuredContent,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
): void {
  const padContent = new Padding(s.content.padding);

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
