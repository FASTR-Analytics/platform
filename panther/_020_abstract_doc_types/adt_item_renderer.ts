// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "./deps.ts";
import type { MergedPageStyle } from "./deps.ts";
import type { MeasurableItem, Measured, RenderContext } from "./deps.ts";

// ADTItemRenderer interface for ADT items that need PageStyles
export interface ADTItemRenderer<TItem, TMeasured extends Measured<TItem>> {
  isType(item: unknown): item is TItem;

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<TItem>,
    pageStyle: MergedPageStyle,
  ): TMeasured;

  render(rc: RenderContext, measured: TMeasured): void;

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MeasurableItem<TItem>,
    pageStyle: MergedPageStyle,
  ): void;

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: MeasurableItem<TItem>,
    pageStyle: MergedPageStyle,
  ): number;
}
