// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { asyncForEach, type RectCoordsDims } from "./deps.ts";
import { measureLayout } from "./layouter.ts";
import {
  isColContainerWithLayout,
  isRowContainerWithLayout,
  type ItemHeightMeasurer,
  type ItemOrContainerForLayout,
  type ItemOrContainerWithLayout,
  type ItemRenderer,
} from "./types.ts";

export async function measureAndRenderLayout<T, U>(
  renderingContext: T,
  root: ItemOrContainerForLayout<U>,
  rpd: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  itemRenderer: ItemRenderer<T, U>,
) {
  const rootWithLayout = await measureLayout(
    renderingContext,
    root,
    rpd,
    gapX,
    gapY,
    itemMeasurer,
  );
  await renderLayout(renderingContext, rootWithLayout, itemRenderer);
}

export async function renderLayout<T, U>(
  renderingContext: T,
  root: ItemOrContainerWithLayout<U>,
  itemRenderer: ItemRenderer<T, U>,
) {
  if (isRowContainerWithLayout(root)) {
    await itemRenderer(renderingContext, root, root.rpd);
    await asyncForEach(root.rows, async (row) => {
      await renderLayout(renderingContext, row, itemRenderer);
    });
    return;
  }
  if (isColContainerWithLayout(root)) {
    await itemRenderer(renderingContext, root, root.rpd);
    await asyncForEach(root.cols, async (col) => {
      await renderLayout(renderingContext, col, itemRenderer);
    });
    return;
  }
  await itemRenderer(renderingContext, root.item, root.rpd);
}
