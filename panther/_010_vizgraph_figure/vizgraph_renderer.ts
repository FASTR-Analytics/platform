// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  RectCoordsDims,
  renderFigureBackground,
  renderFigurePrimitives,
} from "./deps.ts";
import type { HeightConstraints, RenderContext, Renderer } from "./deps.ts";
import type { MeasuredVizGraph, VizGraphInputs } from "./types.ts";
import { measureVizGraph } from "./_internal/measure.ts";
import { vizGraphMinWidth } from "./_internal/build_primitives.ts";

const PROBE_HEIGHT = 9999;
const MIN_CONTENT_HEIGHT = 50;

export const VizGraphRenderer: Renderer<VizGraphInputs, MeasuredVizGraph> = {
  isType(item: unknown): item is VizGraphInputs {
    return typeof item === "object" && item !== null && "vizGraphData" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: VizGraphInputs,
  ): MeasuredVizGraph {
    return measureVizGraph(rc, bounds, item);
  },

  render(rc: RenderContext, measured: MeasuredVizGraph): void {
    renderFigureBackground(rc, measured.measuredSurrounds);
    renderFigurePrimitives(rc, measured.primitives);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: VizGraphInputs,
  ): void {
    const measured = measureVizGraph(rc, bounds, item);
    renderFigureBackground(rc, measured.measuredSurrounds);
    renderFigurePrimitives(rc, measured.primitives);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: VizGraphInputs,
  ): HeightConstraints {
    const probeRcd = new RectCoordsDims({
      x: 0,
      y: 0,
      w: width,
      h: PROBE_HEIGHT,
    });
    const measured = measureVizGraph(rc, probeRcd, item);
    const graphPrimitives = measured.primitives.filter(
      (p) => p.type === "simpleviz-box" || p.type === "vizgraph-edge",
    );

    let idealH: number;
    if (graphPrimitives.length === 0) {
      idealH = measured.extraHeightDueToSurrounds + MIN_CONTENT_HEIGHT;
    } else {
      let minY = Infinity;
      let maxY = -Infinity;
      for (const primitive of graphPrimitives) {
        minY = Math.min(minY, primitive.bounds.y());
        maxY = Math.max(maxY, primitive.bounds.y() + primitive.bounds.h());
      }
      idealH = maxY - minY + measured.extraHeightDueToSurrounds;
    }

    // The graph reflows to the given width (the engine allocates node widths
    // from it); below the floor — every dynamic node at its widest-word
    // minimum — only uniform scale-down helps. Capped at 1: panther figures
    // scale down, never up.
    const minComfortableWidth = vizGraphMinWidth(
      rc,
      item.vizGraphData,
      measured.customFigureStyle.getMergedVizGraphStyle(),
    );
    const neededScalingToFitWidth = width >= minComfortableWidth
      ? 1
      : width / minComfortableWidth;

    return {
      minH: measured.extraHeightDueToSurrounds + MIN_CONTENT_HEIGHT,
      idealH,
      maxH: Infinity,
      neededScalingToFitWidth,
      minComfortableWidth,
    };
  },
};
