// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartOHInputs,
  ChartOHRenderer,
  type ChartOVInputs,
  ChartOVRenderer,
  generateAnnotationPrimitives,
  type HeightConstraints,
  type MapInputs,
  MapRenderer,
  type MeasuredChartOH,
  type MeasuredChartOV,
  type MeasuredMap,
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
  | ChartOHInputs
  | TimeseriesInputs
  | SimpleVizInputs
  | MapInputs;

export type MeasuredFigure =
  | MeasuredTable
  | MeasuredChartOV
  | MeasuredChartOH
  | MeasuredTimeseries
  | MeasuredSimpleViz
  | MeasuredMap;

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
        "chartOHData" in item ||
        "timeseriesData" in item ||
        "simpleVizData" in item ||
        "mapData" in item)
    );
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: FigureInputs,
  ): MeasuredFigure {
    return measureFigure(rc, bounds, item);
  },

  render(rc: RenderContext, measured: MeasuredFigure): void {
    renderFigure(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: FigureInputs,
  ): void {
    const measured = measureFigure(rc, bounds, item);
    renderFigure(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: FigureInputs,
  ): HeightConstraints {
    const renderer = getRendererForFigureItem(item);
    return renderer.getIdealHeight(rc, width, item);
  },
};

// ================================================================================
// MEASURE AND RENDER FUNCTIONS
// ================================================================================

function measureFigure(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: FigureInputs,
): MeasuredFigure {
  const renderer = getRendererForFigureItem(item);
  const measured = renderer.measure(rc, bounds, item);
  if (item.annotations?.length) {
    const sf = measured.customFigureStyle.sf;
    const annotationPrimitives = generateAnnotationPrimitives(
      rc,
      item.annotations,
      measured.primitives,
      sf,
    );
    measured.primitives = [...measured.primitives, ...annotationPrimitives];
  }
  return measured;
}

function renderFigure(rc: RenderContext, measured: MeasuredFigure): void {
  const renderer = getRendererForFigureItem(measured.item);
  renderer.render(rc, measured);
}

// ================================================================================
// HELPERS
// ================================================================================

function getRendererForFigureItem(
  item: FigureInputs,
): Renderer<FigureInputs, MeasuredFigure> {
  const renderer = TableRenderer.isType(item)
    ? TableRenderer
    : ChartOHRenderer.isType(item)
    ? ChartOHRenderer
    : ChartOVRenderer.isType(item)
    ? ChartOVRenderer
    : TimeseriesRenderer.isType(item)
    ? TimeseriesRenderer
    : SimpleVizRenderer.isType(item)
    ? SimpleVizRenderer
    : MapRenderer.isType(item)
    ? MapRenderer
    : undefined;
  if (!renderer) {
    throw new Error("Unknown figure type");
  }
  // The single variance point of the dispatch: isType pairs the item with its
  // renderer, but TS cannot carry that pairing through a union of
  // Renderer<T, M> objects (method-parameter contravariance). Widen the
  // matched renderer to the union-typed Renderer once, here — callers then
  // need no casts, and only ever pass the item/measured the renderer was
  // selected for.
  return renderer as unknown as Renderer<FigureInputs, MeasuredFigure>;
}
