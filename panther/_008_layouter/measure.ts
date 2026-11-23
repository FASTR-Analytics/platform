// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { extractGaps } from "./_internal/extract_gaps.ts";
import {
  getHeightConstraints,
  type MeasureContext,
  measureNode,
} from "./_internal/measure_internal.ts";
import { normalizeLayout, validateLayout } from "./_internal/normalize.ts";
import { _GLOBAL_LAYOUT_COLUMNS, type RectCoordsDims } from "./deps.ts";
import type { LayoutStyleConfig } from "./optimizer.ts";
import { isOverflow } from "./overflow.ts";
import type {
  HeightConstraints,
  ItemHeightMeasurer,
  ItemLayoutNode,
  LayoutNode,
  MeasureLayoutResult,
} from "./types.ts";

export type MeasureLayoutOptions = {
  gapOverlap?: number;
};

export function createCachedMeasurer<T, U>(
  itemMeasurer: ItemHeightMeasurer<T, U>,
): ItemHeightMeasurer<T, U> {
  const cache = new Map<string, HeightConstraints>();
  return (
    ctx: T,
    node: ItemLayoutNode<U>,
    width: number,
  ): HeightConstraints => {
    const key = `${node.id}:${width.toFixed(1)}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const result = itemMeasurer(ctx, node, width);
    cache.set(key, result);
    return result;
  };
}

export function measureLayout<T, U>(
  ctx: T,
  layout: LayoutNode<U>,
  bounds: RectCoordsDims,
  style: LayoutStyleConfig,
  itemMeasurer: ItemHeightMeasurer<T, U>,
  options?: MeasureLayoutOptions,
): MeasureLayoutResult<U> {
  const nCols = _GLOBAL_LAYOUT_COLUMNS;
  const { gapX, gapY } = style;

  validateLayout(layout, nCols);
  const normalizedLayout = normalizeLayout(layout, nCols);

  const singleColWidth = (bounds.w() - (nCols - 1) * gapX) / nCols;

  const dividerPositions: number[] = [];
  for (let i = 0; i < nCols - 1; i++) {
    dividerPositions.push(
      bounds.x() + (i + 1) * singleColWidth + (i + 0.5) * gapX,
    );
  }

  const globalSnapPositions = dividerPositions;

  const measureCtx: MeasureContext<T, U> = {
    renderCtx: ctx,
    gapX,
    gapY,
    layoutStyle: style,
    nAbsoluteGridColumns: nCols,
    dividerPositions,
    globalSnapPositions,
    boundsX: bounds.x(),
    boundsW: bounds.w(),
    itemMeasurer,
    parentStartColumn: 0,
    parentAvailableSpan: nCols,
  };

  // Every container gives each child at least the child's minimum, and a
  // node's own minH only raises its minimum, so a layout is short of height
  // only at its root: this one comparison decides overflow.
  const rootConstraints = getHeightConstraints(
    measureCtx,
    normalizedLayout,
    bounds.w(),
    nCols,
    0,
  );
  const overflow = isOverflow(rootConstraints.minH, bounds.h());

  const measured = measureNode(measureCtx, normalizedLayout, bounds);
  const gaps = extractGaps(
    measured,
    gapX,
    gapY,
    options?.gapOverlap ?? 10,
    measureCtx.dividerPositions,
    measureCtx.globalSnapPositions,
  );

  return { measured, overflow, gaps };
}
