// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ADTItem,
  FigureRenderer,
  getADTItemRendererForADTItem,
  getADTItemType,
  HtmlImageRenderer,
  type ItemHeightMeasurer,
  type ItemIdealHeightInfo,
} from "../../deps.ts";
import type { PageRenderContext } from "../../types.ts";

export const _MINIMAL_HEIGHT = 30;

export const itemMeasurer: ItemHeightMeasurer<
  PageRenderContext,
  ADTItem
> = async (src, item, width): Promise<ItemIdealHeightInfo> => {
  const itemType = getADTItemType(item);
  const defaults = src.s.content.itemLayoutDefaults[itemType];

  // Handle figure separately (it's a Renderer, not ADTItemRenderer)
  if (itemType === "figure" && FigureRenderer.isType(item)) {
    // For figures, we don't have proper height calculation yet
    const couldStretch = item.stretch ?? defaults.stretch;
    const fillToAreaHeight = item.fillArea ?? defaults.fillArea;
    const idealH = couldStretch || fillToAreaHeight
      ? _MINIMAL_HEIGHT
      : FigureRenderer.getIdealHeight(src.rc, width, item);
    return {
      idealH,
      couldStretch,
      fillToAreaHeight,
    };
  }

  // Try to get ADTItemRenderer
  const renderer = getADTItemRendererForADTItem(item);
  if (renderer) {
    const couldStretch = item.stretch ?? defaults.stretch;
    const fillToAreaHeight = item.fillArea ?? defaults.fillArea;

    const idealH = itemType === "htmlImage" &&
        HtmlImageRenderer.isType(itemType) &&
        (couldStretch || fillToAreaHeight)
      ? _MINIMAL_HEIGHT
      : renderer.getIdealHeight(src.rc, width, item, src.s);

    return {
      idealH,
      couldStretch,
      fillToAreaHeight,
    };
  }

  // This should never happen if ADTItem is properly typed
  throw new Error(`No renderer found for item type: ${itemType}`);
};
