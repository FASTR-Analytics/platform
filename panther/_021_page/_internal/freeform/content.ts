// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ADTItem,
  getColor,
  type ItemOrContainerWithLayout,
  type LayoutWarning,
  measureLayoutWithWarnings,
  type MergedPageStyle,
  Padding,
  RectCoordsDims,
  type RenderContext,
  renderLayout,
} from "../../deps.ts";
import { itemMeasurer } from "./item_measurer.ts";
import { itemRenderer } from "./item_renderer.ts";
import type { FreeformPageInputs } from "../../types.ts";

export interface MeasuredContent {
  rcdContentOuter: RectCoordsDims;
  rcdContentInner: RectCoordsDims;
  mLayout: ItemOrContainerWithLayout<ADTItem>;
  warnings: LayoutWarning[];
}

export async function measureContent(
  rc: RenderContext,
  rcdOuter: RectCoordsDims,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
  headerHeight: number,
  footerHeight: number,
): Promise<MeasuredContent> {
  const padContent = new Padding(s.content.padding);

  const rcdContentOuter = new RectCoordsDims([
    rcdOuter.x(),
    rcdOuter.y() + headerHeight,
    rcdOuter.w(),
    rcdOuter.h() - headerHeight - footerHeight,
  ]);

  const rcdContentInner = rcdContentOuter.getPadded(padContent);

  const { layout, warnings } = await measureLayoutWithWarnings(
    { rc, s },
    inputs.content,
    rcdContentInner,
    s.content.gapX,
    s.content.gapY,
    itemMeasurer,
  );

  return {
    rcdContentOuter,
    rcdContentInner,
    mLayout: layout,
    warnings,
  };
}

export async function renderContent(
  rc: RenderContext,
  measured: MeasuredContent,
  inputs: FreeformPageInputs,
  s: MergedPageStyle,
): Promise<void> {
  const padContent = new Padding(s.content.padding);

  if (s.content.backgroundColor !== "none") {
    rc.rRect(measured.rcdContentOuter, {
      fillColor: getColor(s.content.backgroundColor),
    });
  }

  await renderLayout({ rc, s }, measured.mLayout, itemRenderer);

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
