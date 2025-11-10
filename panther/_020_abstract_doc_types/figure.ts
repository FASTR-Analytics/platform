// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartOVInputs,
  ChartOVRenderer,
  type MeasuredChartOV,
  type MeasuredTable,
  type MeasuredTimeseries,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
  type TableInputs,
  TableRenderer,
  type TimeseriesInputs,
  TimeseriesRenderer,
} from "./deps.ts";

// ================================================================================
// TYPES
// ================================================================================

export type ADTFigure = TableInputs | ChartOVInputs | TimeseriesInputs;

export type MeasuredFigure =
  | MeasuredTable
  | MeasuredChartOV
  | MeasuredTimeseries;

// ================================================================================
// RENDERER
// ================================================================================

export const FigureRenderer: Renderer<ADTFigure, MeasuredFigure> = {
  isType(item: unknown): item is ADTFigure {
    return (
      typeof item === "object" &&
      item !== null &&
      ("tableData" in item || "chartData" in item || "timeseriesData" in item)
    );
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ADTFigure,
    responsiveScale?: number,
  ): MeasuredFigure {
    return measureFigure(rc, bounds, item, responsiveScale);
  },

  render(rc: RenderContext, measured: MeasuredFigure): void {
    renderFigure(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ADTFigure,
    responsiveScale?: number,
  ): void {
    const measured = measureFigure(rc, bounds, item, responsiveScale);
    renderFigure(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: ADTFigure,
    responsiveScale?: number,
  ): number {
    const renderer = getRendererForFigureItem(item);
    return renderer.getIdealHeight(rc, width, item as any, responsiveScale);
  },
};

// ================================================================================
// MEASURE AND RENDER FUNCTIONS
// ================================================================================

function measureFigure(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: ADTFigure,
  responsiveScale?: number,
): MeasuredFigure {
  const renderer = getRendererForFigureItem(item);
  return renderer.measure(rc, bounds, item as any, responsiveScale);
}

function renderFigure(rc: RenderContext, measured: MeasuredFigure): void {
  const renderer = getRendererForFigureItem(measured.item);
  renderer.render(rc, measured as any);
}

// ================================================================================
// HELPERS
// ================================================================================

function getRendererForFigureItem(
  item: ADTFigure,
): typeof TableRenderer | typeof ChartOVRenderer | typeof TimeseriesRenderer {
  if (TableRenderer.isType(item)) {
    return TableRenderer;
  }
  if (ChartOVRenderer.isType(item)) {
    return ChartOVRenderer;
  }
  if (TimeseriesRenderer.isType(item)) {
    return TimeseriesRenderer;
  }
  throw new Error("Unknown figure type");
}
