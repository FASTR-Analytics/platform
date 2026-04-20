// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureChartOH } from "./_internal/measure_chartoh.ts";
import { renderChartOH } from "./_internal/render_chartoh.ts";
import { getChartOHComponentSizes } from "./_internal/get_size_info.ts";
import {
  getChartHeightConstraints,
  type HeightConstraints,
  measureChartWithAutofit,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
} from "./deps.ts";
import type { ChartOHInputs, MeasuredChartOH } from "./types.ts";

export const ChartOHRenderer: Renderer<ChartOHInputs, MeasuredChartOH> = {
  isType(item: unknown): item is ChartOHInputs {
    return typeof item === "object" && item !== null && "chartOHData" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ChartOHInputs,
    responsiveScale?: number,
  ): MeasuredChartOH {
    return measureChartWithAutofit(
      rc,
      bounds,
      item,
      (scale) => getChartOHComponentSizes(rc, item, scale),
      measureChartOH,
      responsiveScale,
    );
  },

  render(rc: RenderContext, mChartOH: MeasuredChartOH) {
    renderChartOH(rc, mChartOH);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ChartOHInputs,
    responsiveScale?: number,
  ): void {
    const measured = measureChartWithAutofit(
      rc,
      bounds,
      item,
      (scale) => getChartOHComponentSizes(rc, item, scale),
      measureChartOH,
      responsiveScale,
    );
    renderChartOH(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: ChartOHInputs,
    responsiveScale?: number,
  ): HeightConstraints {
    return getChartHeightConstraints(
      rc,
      width,
      item,
      (scale) => getChartOHComponentSizes(rc, item, scale),
      responsiveScale,
    );
  },
};
