// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartOVInputs,
  ChartOVRenderer,
  type MeasuredChartOV,
  type MeasuredSimpleViz,
  type MeasuredTable,
  type MeasuredTimeseries,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
  type SimpleVizInputs,
  SimpleVizRenderer,
  type TableInputs,
  TableRenderer,
  type TimeseriesInputs,
  TimeseriesRenderer,
} from "./deps.ts";

// ================================================================================
// TYPES
// ================================================================================

export type FigureInputs =
  | TableInputs
  | ChartOVInputs
  | TimeseriesInputs
  | SimpleVizInputs;

export type MeasuredFigure =
  | MeasuredTable
  | MeasuredChartOV
  | MeasuredTimeseries
  | MeasuredSimpleViz;

// ================================================================================
// RENDERER
// ================================================================================

export const FigureRenderer: Renderer<FigureInputs, MeasuredFigure> = {
  isType(item: unknown): item is FigureInputs {
    return (
      typeof item === "object" &&
      item !== null &&
      ("tableData" in item ||
        "chartData" in item ||
        "timeseriesData" in item ||
        "simpleVizData" in item)
    );
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: FigureInputs,
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
    item: FigureInputs,
    responsiveScale?: number,
  ): void {
    const measured = measureFigure(rc, bounds, item, responsiveScale);
    renderFigure(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: FigureInputs,
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
  item: FigureInputs,
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
  item: FigureInputs,
):
  | typeof TableRenderer
  | typeof ChartOVRenderer
  | typeof TimeseriesRenderer
  | typeof SimpleVizRenderer {
  if (TableRenderer.isType(item)) {
    return TableRenderer;
  }
  if (ChartOVRenderer.isType(item)) {
    return ChartOVRenderer;
  }
  if (TimeseriesRenderer.isType(item)) {
    return TimeseriesRenderer;
  }
  if (SimpleVizRenderer.isType(item)) {
    return SimpleVizRenderer;
  }
  throw new Error("Unknown figure type");
}
