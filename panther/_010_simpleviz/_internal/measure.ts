// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  measureSurrounds,
  type RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type { MeasuredSimpleViz, SimpleVizInputs } from "../types.ts";
import { buildBoxPrimitives } from "./build_box_primitives.ts";

export function measureSimpleViz(
  rc: RenderContext,
  rcdWithSurrounds: RectCoordsDims,
  item: SimpleVizInputs,
  responsiveScale?: number,
): MeasuredSimpleViz {
  const caption = item.caption;
  const subCaption = item.subCaption;
  const footnote = item.footnote;

  const customFigureStyle = new CustomFigureStyle(
    item.style,
    responsiveScale,
  );

  const legendItemsOrLabels = item.legendItemsOrLabels;

  const measuredSurrounds = measureSurrounds(
    rc,
    rcdWithSurrounds,
    customFigureStyle,
    caption,
    subCaption,
    footnote,
    legendItemsOrLabels,
  );
  const extraHeightDueToSurrounds = measuredSurrounds.extraHeightDueToSurrounds;
  const contentRcd = measuredSurrounds.contentRcd;

  // Build box primitives from raw data
  const primitives = buildBoxPrimitives(
    rc,
    contentRcd,
    item.simpleVizData,
    customFigureStyle,
    responsiveScale,
  );

  return {
    item,
    bounds: rcdWithSurrounds,
    measuredSurrounds,
    extraHeightDueToSurrounds,
    customFigureStyle,
    transformedData: item.simpleVizData,
    primitives,
    caption,
    subCaption,
    footnote,
  };
}
