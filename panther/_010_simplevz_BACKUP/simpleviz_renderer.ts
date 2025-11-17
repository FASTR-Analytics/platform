// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureSimpleViz } from "./_internal/measure.ts";
import { renderSimpleViz } from "./_internal/render.ts";
import { RectCoordsDims } from "./deps.ts";
import type { BoxPrimitive, RenderContext, Renderer } from "./deps.ts";
import type { MeasuredSimpleViz, SimpleVizInputs } from "./types.ts";

export const SimpleVizRenderer: Renderer<
  SimpleVizInputs,
  MeasuredSimpleViz
> = {
  isType(item: unknown): item is SimpleVizInputs {
    return (item as SimpleVizInputs).simpleVizData !== undefined;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: SimpleVizInputs,
    responsiveScale?: number,
  ): MeasuredSimpleViz {
    return measureSimpleViz(rc, bounds, item, responsiveScale);
  },

  render(rc: RenderContext, measured: MeasuredSimpleViz): void {
    renderSimpleViz(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: SimpleVizInputs,
    responsiveScale?: number,
  ): void {
    const measured = measureSimpleViz(rc, bounds, item, responsiveScale);
    renderSimpleViz(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: SimpleVizInputs,
    responsiveScale?: number,
  ): number {
    const dummyRcd = new RectCoordsDims({ x: 0, y: 0, w: width, h: 9999 });
    const mSimpleViz = measureSimpleViz(rc, dummyRcd, item, responsiveScale);

    // Calculate bounds from the rendered primitives (after auto-sizing and scaling)
    const boxPrimitives = mSimpleViz.primitives.filter((p) =>
      p.type === "simpleviz-box"
    ) as BoxPrimitive[];

    if (boxPrimitives.length === 0) {
      return width + mSimpleViz.extraHeightDueToSurrounds;
    }

    let minY = Infinity;
    let maxY = -Infinity;

    for (const boxPrim of boxPrimitives) {
      const rcd = boxPrim.rcd;
      minY = Math.min(minY, rcd.y());
      maxY = Math.max(maxY, rcd.y() + rcd.h());
    }

    const contentHeight = maxY - minY;
    return contentHeight + mSimpleViz.extraHeightDueToSurrounds;
  },
};
