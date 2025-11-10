// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ADTItemRenderer } from "./adt_item_renderer.ts";
import type {
  ColorKeyOrString,
  MeasurableItem,
  Measured,
  MergedPageStyle,
  RectCoordsDims,
  RenderContext,
} from "./deps.ts";

// ================================================================================
// TYPES
// ================================================================================

export type ADTSpacer = {
  spacer: true;
  noShading?: boolean;
  // height?: number;
  backgroundColor?: ColorKeyOrString;
};

// ================================================================================
// MEASURED TYPES
// ================================================================================

type MeasuredSpacerInfo = {
  height: number;
  backgroundColor?: ColorKeyOrString;
  noShading?: boolean;
};

export type MeasuredSpacer = Measured<ADTSpacer> & {
  measuredInfo: MeasuredSpacerInfo;
};

// ================================================================================
// RENDERER
// ================================================================================

export const SpacerRenderer: ADTItemRenderer<ADTSpacer, MeasuredSpacer> = {
  isType(item: unknown): item is ADTSpacer {
    return typeof item === "object" && item !== null && "spacer" in item;
  },

  measure(
    _rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTSpacer>,
    pageStyle: MergedPageStyle,
  ): MeasuredSpacer {
    return measureSpacer(bounds, item, pageStyle);
  },

  render(rc: RenderContext, measured: MeasuredSpacer): void {
    renderSpacer(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<ADTSpacer>,
    pageStyle: MergedPageStyle,
  ): void {
    const measured = measureSpacer(bounds, item, pageStyle);
    renderSpacer(rc, measured);
  },

  getIdealHeight(
    _rc: RenderContext,
    _width: number,
    item: MeasurableItem<ADTSpacer>,
    pageStyle: MergedPageStyle,
  ): number {
    // Defaul
    // t spacer height from page style or 30px
    return item.height ?? (pageStyle.content as any).spacerHeight ?? 30;
  },
};

// ================================================================================
// MEASURE AND RENDER FUNCTIONS
// ================================================================================

function measureSpacer(
  bounds: RectCoordsDims,
  item: MeasurableItem<ADTSpacer>,
  pageStyle: MergedPageStyle,
): MeasuredSpacer {
  const height = item.height ?? (pageStyle.content as any).spacerHeight ?? 30;

  const measuredInfo: MeasuredSpacerInfo = {
    height,
    backgroundColor: item.backgroundColor,
    noShading: item.noShading,
  };

  return {
    item,
    bounds,
    measuredInfo,
  };
}

function renderSpacer(rc: RenderContext, measured: MeasuredSpacer): void {
  const { bounds, measuredInfo } = measured;

  if (!measuredInfo.noShading) {
    // Use custom background color or default to base200
    const fillColor = measuredInfo.backgroundColor ?? { key: "base200" };
    rc.rRect(bounds, { show: true, fillColor });
  }
}
