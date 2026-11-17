// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type ChartOHInputs,
  ChartOHRenderer,
  type ChartOVInputs,
  ChartOVRenderer,
  type DiagramInputs,
  DiagramRenderer,
  generateAnnotationPrimitives,
  type HeightConstraints,
  type MapInputs,
  MapRenderer,
  type MeasuredChartOH,
  type MeasuredChartOV,
  type MeasuredDiagram,
  type MeasuredMap,
  type MeasuredPie,
  type MeasuredScene,
  type MeasuredTable,
  type MeasuredTimeseries,
  type PieInputs,
  PieRenderer,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
  type SceneInputs,
  SceneRenderer,
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
  | MapInputs
  | PieInputs
  | SceneInputs
  | DiagramInputs;

export type MeasuredFigure =
  | MeasuredTable
  | MeasuredChartOV
  | MeasuredChartOH
  | MeasuredTimeseries
  | MeasuredMap
  | MeasuredPie
  | MeasuredScene
  | MeasuredDiagram;

export type FigureType = FigureInputs["figureType"];

// ================================================================================
// RENDERER
// ================================================================================

export const FigureRenderer: Renderer<FigureInputs, MeasuredFigure> = {
  isType(inputs: unknown): inputs is FigureInputs {
    if (
      typeof inputs !== "object" || inputs === null || !("figureType" in inputs)
    ) {
      return false;
    }
    // The cast makes the switch exhaustiveness-checked: a new FigureInputs
    // member fails typecheck here (and in getFigureRenderer) until its
    // tag is handled. Unknown runtime strings fall to default and return false.
    const figureType = inputs.figureType as FigureType;
    switch (figureType) {
      case "table":
      case "chart-ov":
      case "chart-oh":
      case "timeseries":
      case "map":
      case "pie":
      case "scene":
      case "diagram":
        return true;
      default: {
        const _exhaustive: never = figureType;
        return false;
      }
    }
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: FigureInputs,
  ): MeasuredFigure {
    return measureFigure(rc, bounds, inputs);
  },

  render(rc: RenderContext, measured: MeasuredFigure): void {
    renderFigure(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: FigureInputs,
  ): void {
    const measured = measureFigure(rc, bounds, inputs);
    renderFigure(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    inputs: FigureInputs,
  ): HeightConstraints {
    const renderer = getFigureRenderer(inputs);
    return renderer.getIdealHeight(rc, width, inputs);
  },
};

// ================================================================================
// MEASURE AND RENDER FUNCTIONS
// ================================================================================

function measureFigure(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: FigureInputs,
): MeasuredFigure {
  const renderer = getFigureRenderer(inputs);
  const measured = renderer.measure(rc, bounds, inputs);
  if (inputs.annotations?.length) {
    const sf = measured.customFigureStyle.sf;
    const annotationPrimitives = generateAnnotationPrimitives(
      rc,
      inputs.annotations,
      measured.primitives,
      sf,
    );
    measured.primitives = [...measured.primitives, ...annotationPrimitives];
  }
  return measured;
}

function renderFigure(rc: RenderContext, measured: MeasuredFigure): void {
  const renderer = getFigureRenderer(measured.inputs);
  renderer.render(rc, measured);
}

// ================================================================================
// HELPERS
// ================================================================================

function getFigureRenderer(
  inputs: FigureInputs,
): Renderer<FigureInputs, MeasuredFigure> {
  const renderer = pickRenderer(inputs);
  // The single variance point of the dispatch: the tag pairs the inputs with its
  // renderer, but TS cannot carry that pairing through a union of
  // Renderer<T, M> objects (method-parameter contravariance). Widen the
  // matched renderer to the union-typed Renderer once, here — callers then
  // need no casts, and only ever pass the inputs/measured the renderer was
  // selected for.
  return renderer as unknown as Renderer<FigureInputs, MeasuredFigure>;
}

function pickRenderer(inputs: FigureInputs) {
  switch (inputs.figureType) {
    case "table":
      return TableRenderer;
    case "chart-ov":
      return ChartOVRenderer;
    case "chart-oh":
      return ChartOHRenderer;
    case "timeseries":
      return TimeseriesRenderer;
    case "map":
      return MapRenderer;
    case "pie":
      return PieRenderer;
    case "scene":
      return SceneRenderer;
    case "diagram":
      return DiagramRenderer;
    default: {
      const _exhaustive: never = inputs;
      throw new Error("Unknown figure type");
    }
  }
}
