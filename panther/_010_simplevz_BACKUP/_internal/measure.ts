// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  generateSurroundsPrimitives,
  measureSurrounds,
  type RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type { MeasuredSimpleViz, SimpleVizInputs } from "../types.ts";
import { buildArrowPrimitives } from "./build_arrow_primitives.ts";
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
  const boxPrimitives = buildBoxPrimitives(
    rc,
    contentRcd,
    item.simpleVizData,
    customFigureStyle,
  );

  // Build arrow primitives using box positions
  const arrowPrimitives = buildArrowPrimitives(
    item.simpleVizData.arrows,
    item.simpleVizData.boxes,
    boxPrimitives.filter((p) => p.type === "simpleviz-box"),
    customFigureStyle.simpleviz(),
  );

  // Generate surrounds primitives (captions and legend)
  const surroundsPrimitives = generateSurroundsPrimitives(
    measuredSurrounds,
  );

  // Combine all primitives
  const primitives = [
    ...boxPrimitives,
    ...arrowPrimitives,
    ...surroundsPrimitives,
  ];

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
