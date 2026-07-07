// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  generateSurroundsPrimitives,
  measureSurrounds,
} from "../deps.ts";
import type { RectCoordsDims, RenderContext } from "../deps.ts";
import type { MeasuredVizGraph, VizGraphInputs } from "../types.ts";
import { buildVizGraphPrimitives } from "./build_primitives.ts";

export function measureVizGraph(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  item: VizGraphInputs,
): MeasuredVizGraph {
  const caption = item.caption;
  const subCaption = item.subCaption;
  const footnote = item.footnote;

  const customFigureStyle = new CustomFigureStyle(item.style);

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

  const graphPrimitives = buildVizGraphPrimitives(
    rc,
    contentRcd,
    item.vizGraphData,
    customFigureStyle.getMergedVizGraphStyle(),
  );

  const surroundsPrimitives = generateSurroundsPrimitives(measuredSurrounds);

  return {
    item,
    bounds: rcdWithSurrounds,
    measuredSurrounds,
    extraHeightDueToSurrounds,
    customFigureStyle,
    transformedData: item.vizGraphData,
    primitives: [...graphPrimitives, ...surroundsPrimitives],
    caption,
    subCaption,
    footnote,
  };
}
