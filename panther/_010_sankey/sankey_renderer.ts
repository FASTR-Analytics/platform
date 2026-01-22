// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type HeightConstraints,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
} from "./deps.ts";
import type { MeasuredSankey, SankeyInputs } from "./types.ts";
import { measureSankey } from "./_internal/measure.ts";
import { renderSankey } from "./_internal/render.ts";

export const SankeyRenderer: Renderer<SankeyInputs, MeasuredSankey> = {
  isType(item: unknown): item is SankeyInputs {
    return (item as SankeyInputs).sankeyData !== undefined;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: SankeyInputs,
    responsiveScale?: number,
  ): MeasuredSankey {
    return measureSankey(rc, bounds, item, responsiveScale);
  },

  render(rc: RenderContext, measured: MeasuredSankey): void {
    renderSankey(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: SankeyInputs,
    responsiveScale?: number,
  ): void {
    const measured = this.measure(rc, bounds, item, responsiveScale);
    this.render(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: SankeyInputs,
    responsiveScale?: number,
  ): HeightConstraints {
    const testHeight = 1000;
    const bounds = new RectCoordsDims({ x: 0, y: 0, w: width, h: testHeight });
    const measured = this.measure(rc, bounds, item, responsiveScale);
    const idealH = testHeight + measured.extraHeightDueToSurrounds;
    return { minH: 0, idealH, maxH: Infinity };
  },
};
