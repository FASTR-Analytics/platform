// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureChartOV } from "./_internal/measure_chartov.ts";
import { renderChartOV } from "./_internal/render_chartov.ts";
import { getChartOVComponentSizes } from "./_internal/get_size_info.ts";
import {
  getChartHeightConstraints,
  type HeightConstraints,
  measureChartWithAutofit,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
} from "./deps.ts";
import type { ChartOVInputs, MeasuredChartOV } from "./types.ts";

export const ChartOVRenderer: Renderer<ChartOVInputs, MeasuredChartOV> = {
  isType(item: unknown): item is ChartOVInputs {
    return typeof item === "object" && item !== null && "chartData" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ChartOVInputs,
    responsiveScale?: number,
  ): MeasuredChartOV {
    return measureChartWithAutofit(
      rc,
      bounds,
      item,
      (scale) => getChartOVComponentSizes(rc, item, scale),
      measureChartOV,
      responsiveScale,
    );
  },

  render(rc: RenderContext, mChartOV: MeasuredChartOV) {
    renderChartOV(rc, mChartOV);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ChartOVInputs,
    responsiveScale?: number,
  ): void {
    const measured = measureChartWithAutofit(
      rc,
      bounds,
      item,
      (scale) => getChartOVComponentSizes(rc, item, scale),
      measureChartOV,
      responsiveScale,
    );
    renderChartOV(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: ChartOVInputs,
    _responsiveScale?: number,
  ): HeightConstraints {
    return getChartHeightConstraints(
      rc,
      width,
      item,
      (scale) => getChartOVComponentSizes(rc, item, scale),
    );
  },
};
