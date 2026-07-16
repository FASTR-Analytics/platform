// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  computeFloorScale,
  CustomFigureStyle,
  RectCoordsDims,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveFigureAutofitOptions,
} from "./deps.ts";
import type { HeightConstraints, RenderContext, Renderer } from "./deps.ts";
import type { MeasuredVizGraph, VizGraphInputs } from "./types.ts";
import {
  measureVizGraph,
  measureVizGraphWithAutofit,
} from "./_internal/measure.ts";
import {
  createVizGraphLayoutCache,
  vizGraphMinWidth,
} from "./_internal/generate_primitives.ts";
import type { VizGraphLayoutCache } from "./_internal/generate_primitives.ts";

const PROBE_HEIGHT = 9999;
const MIN_CONTENT_HEIGHT = 50;

// The graph's ideal height at a given width and shrink scale: probe-measure in
// an unconstrained frame and take the graph primitives' vertical extent plus
// the surrounds. (Probe frames never trigger the autofit path — this measures
// at the exact scale asked for.)
function probeIdealH(
  rc: RenderContext,
  width: number,
  item: VizGraphInputs,
  fitScale: number,
  cache: VizGraphLayoutCache,
): number {
  const probeRcd = new RectCoordsDims({
    x: 0,
    y: 0,
    w: width,
    h: PROBE_HEIGHT,
  });
  const measured = measureVizGraph(rc, probeRcd, item, fitScale, cache);
  if (measured.graphExtent === undefined) {
    return measured.extraHeightDueToSurrounds + MIN_CONTENT_HEIGHT;
  }
  return measured.graphExtent.maxY - measured.graphExtent.minY +
    measured.extraHeightDueToSurrounds;
}

export const VizGraphRenderer: Renderer<VizGraphInputs, MeasuredVizGraph> = {
  isType(item: unknown): item is VizGraphInputs {
    return typeof item === "object" && item !== null && "vizGraphData" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: VizGraphInputs,
  ): MeasuredVizGraph {
    return measureVizGraphWithAutofit(rc, bounds, item);
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
    const measured = measureVizGraphWithAutofit(rc, bounds, item);
    renderFigureBackground(rc, measured.measuredSurrounds);
    renderFigurePrimitives(rc, measured.primitives);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: VizGraphInputs,
  ): HeightConstraints {
    // One cache per call: the scale-1 probe, the min-width probe, and the
    // autofit floor probe share bundles (and any coinciding layouts).
    const cache = createVizGraphLayoutCache();
    const idealH = probeIdealH(rc, width, item, 1, cache);

    // The graph reflows to the given width (the engine allocates node widths
    // from it); below the floor — every dynamic node at its widest-word
    // minimum — only uniform scale-down helps. Capped at 1: panther figures
    // scale down, never up.
    const cs = new CustomFigureStyle(item.style);
    const minComfortableWidth = vizGraphMinWidth(
      rc,
      item.vizGraphData,
      cs.getMergedVizGraphStyle(),
      cache,
      item.customNode,
    );
    const neededScalingToFitWidth = width >= minComfortableWidth
      ? 1
      : width / minComfortableWidth;

    // maxH = idealH signals "I resist stretching past ideal" (extra height
    // buys a graph nothing — it centers); the page layouter owns how far it
    // may actually stretch (content.figureMaxStretch).
    const maxH = idealH;

    const autofitOpts = resolveFigureAutofitOptions(item.autofit);
    if (!autofitOpts) {
      return {
        minH: idealH,
        idealH,
        maxH,
        neededScalingToFitWidth,
        minComfortableWidth,
      };
    }

    // With autofit, minH is the height at the (floor-aware) minimum scale.
    const floorScale = computeFloorScale({
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu: cs.baseFontSize,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    });
    const minH = probeIdealH(rc, width, item, floorScale, cache);

    return {
      minH,
      idealH,
      maxH,
      neededScalingToFitWidth,
      minComfortableWidth,
    };
  },
};
