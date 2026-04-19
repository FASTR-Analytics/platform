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
  ): HeightConstraints {
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
  const measured = renderer.measure(rc, bounds, item as any, responsiveScale);
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
  | typeof ChartOHRenderer
  | typeof TimeseriesRenderer
  | typeof SimpleVizRenderer
  | typeof MapRenderer {
  if (TableRenderer.isType(item)) {
    return TableRenderer;
  }
  if (ChartOHRenderer.isType(item)) {
    return ChartOHRenderer;
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
  if (MapRenderer.isType(item)) {
    return MapRenderer;
  }
  throw new Error("Unknown figure type");
}
