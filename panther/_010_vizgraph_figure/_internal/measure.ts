// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildFitReport,
  CustomFigureStyle,
  findFitScaleWithFloor,
  generateSurroundsPrimitives,
  measureSurrounds,
  memoizeByScale,
  resolveFigureAutofitOptions,
} from "../deps.ts";
import type { RectCoordsDims, RenderContext } from "../deps.ts";
import type { MeasuredVizGraph, VizGraphInputs } from "../types.ts";
import {
  createVizGraphLayoutCache,
  generateVizGraphPrimitives,
  vizGraphSizeAtWidth,
} from "./generate_primitives.ts";
import type { VizGraphLayoutCache } from "./generate_primitives.ts";

export function measureVizGraph(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  item: VizGraphInputs,
  fitScale?: number,
  cache?: VizGraphLayoutCache,
): MeasuredVizGraph {
  const caption = item.caption;
  const subCaption = item.subCaption;
  const footnote = item.footnote;

  const customFigureStyle = new CustomFigureStyle(
    item.style,
    fitScale,
    item.autofitSurrounds,
  );

  const measuredSurrounds = measureSurrounds(
    rc,
    rcdWithSurrounds,
    customFigureStyle,
    caption,
    subCaption,
    footnote,
    item.legend,
  );
  const extraHeightDueToSurrounds = measuredSurrounds.extraHeightDueToSurrounds;
  const contentRcd = measuredSurrounds.contentRcd;

  const graphPrimitives = generateVizGraphPrimitives(
    rc,
    contentRcd,
    item.vizGraphData,
    customFigureStyle.getMergedVizGraphStyle(),
    cache,
    item.customNode,
  );

  let graphExtent: { minY: number; maxY: number } | undefined;
  for (const p of graphPrimitives) {
    const minY = p.bounds.y();
    const maxY = p.bounds.y() + p.bounds.h();
    graphExtent = graphExtent === undefined ? { minY, maxY } : {
      minY: Math.min(graphExtent.minY, minY),
      maxY: Math.max(graphExtent.maxY, maxY),
    };
  }

  const surroundsPrimitives = generateSurroundsPrimitives(measuredSurrounds);

  return {
    item,
    bounds: rcdWithSurrounds,
    measuredSurrounds,
    extraHeightDueToSurrounds,
    customFigureStyle,
    transformedData: item.vizGraphData,
    primitives: [...graphPrimitives, ...surroundsPrimitives],
    graphExtent,
    caption,
    subCaption,
    footnote,
  };
}

// Shrink-to-fit (autofit is ON unless the item opts out), identical semantics
// to the other figures: shrink to the legibility floor, and below it render AT
// the floor flagged `cramped` — the render may overflow the frame, and that is
// the signal (Tim, 2026-07-12: "if it is cramped, we need to know it is
// cramped, and it doesn't matter if it overflows width or height at that
// point"; supersedes the 2026-07-07 "below the floor, uniform scale-down" line
// for the figure adapter). autofit: false is a plain measure — no cramped, no
// fitReport.
export function measureVizGraphWithAutofit(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: VizGraphInputs,
): MeasuredVizGraph {
  const autofitOpts = resolveFigureAutofitOptions(item.autofit);
  if (!autofitOpts) {
    return measureVizGraph(rc, bounds, item);
  }

  // One cache per autofit run: the fit search's probes and the final measure
  // share bundles and layouts (the final layout at fitScale is a probe hit).
  const cache = createVizGraphLayoutCache();
  const getSizeAtScale = memoizeByScale((scale: number) => {
    const cs = new CustomFigureStyle(item.style, scale, item.autofitSurrounds);
    const measuredSurrounds = measureSurrounds(
      rc,
      bounds,
      cs,
      item.caption,
      item.subCaption,
      item.footnote,
      item.legend,
    );
    const { minWidth, graphH } = vizGraphSizeAtWidth(
      rc,
      item.vizGraphData,
      cs.getMergedVizGraphStyle(),
      measuredSurrounds.contentRcd.w(),
      cache,
      item.customNode,
    );
    return {
      minWidth: minWidth + (bounds.w() - measuredSurrounds.contentRcd.w()),
      idealHeight: graphH + measuredSurrounds.extraHeightDueToSurrounds,
    };
  });

  const baseFontSizeDu = new CustomFigureStyle(item.style).baseFontSize;
  const { fitScale, floorScale, cramped } = findFitScaleWithFloor(
    bounds.w(),
    bounds.h(),
    {
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    },
    getSizeAtScale,
  );

  const measured = measureVizGraph(rc, bounds, item, fitScale, cache);
  measured.cramped = cramped;
  measured.fitReport = buildFitReport(
    fitScale,
    floorScale,
    cramped,
    getSizeAtScale,
  );
  return measured;
}
