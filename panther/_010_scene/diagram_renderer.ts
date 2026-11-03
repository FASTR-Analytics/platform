// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { renderFigureBackground, renderFigurePrimitives } from "./deps.ts";
import type {
  HeightConstraints,
  RectCoordsDims,
  RenderContext,
  Renderer,
} from "./deps.ts";
import type { DiagramInputs, MeasuredDiagram } from "./types.ts";
import { diagramSource } from "./_internal/diagram.ts";
import {
  getSceneFigureIdealHeight,
  measureSceneFigure,
} from "./_internal/measure.ts";

export const DiagramRenderer: Renderer<DiagramInputs, MeasuredDiagram> = {
  isType(item: unknown): item is DiagramInputs {
    return typeof item === "object" && item !== null &&
      "figureType" in item && item.figureType === "diagram";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: DiagramInputs,
  ): MeasuredDiagram {
    return measureSceneFigure(
      rc,
      bounds,
      item,
      diagramSource(item.data, item.customNode),
    );
  },

  render(rc: RenderContext, measured: MeasuredDiagram): void {
    renderFigureBackground(rc, measured.measuredSurrounds);
    renderFigurePrimitives(rc, measured.primitives);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: DiagramInputs,
  ): void {
    this.render(rc, this.measure(rc, bounds, item));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: DiagramInputs,
  ): HeightConstraints {
    return getSceneFigureIdealHeight(
      rc,
      width,
      item,
      diagramSource(item.data, item.customNode),
    );
  },
};
