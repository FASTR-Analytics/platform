// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ADTItem,
  FigureRenderer,
  getADTItemRendererForADTItem,
  getADTItemType,
  isContainerInMeasurerFunc,
  type ItemRenderer,
} from "../../deps.ts";
import type { PageRenderContext } from "../../types.ts";

export const itemRenderer: ItemRenderer<PageRenderContext, ADTItem> = async (
  src,
  item,
  rcd,
): Promise<void> => {
  if (isContainerInMeasurerFunc(item)) {
    return;
  }

  // Check item type first
  const itemType = getADTItemType(item);

  // Handle figure separately (it's a Renderer, not ADTItemRenderer)
  if (itemType === "figure" && FigureRenderer.isType(item)) {
    FigureRenderer.measureAndRender(src.rc, rcd, item);
    return;
  }

  // Try to get ADTItemRenderer for the item
  const renderer = getADTItemRendererForADTItem(item);
  if (renderer) {
    renderer.measureAndRender(src.rc, rcd, item, src.s);
    return;
  }

  // This should never happen if ADTItem is properly typed
  throw new Error(`No renderer found for item type: ${itemType}`);
};
