// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Primitive } from "../deps.ts";
import { calculateMappedCoordinates } from "./calculate_mapped_coordinates.ts";
import type { ContentGenerationContext } from "./content_generation_types.ts";
import { generateAreaPrimitives } from "./generate_area_primitives.ts";
import { generateBarPrimitives } from "./generate_bar_primitives.ts";
import { generateCascadeArrowPrimitives } from "./generate_cascade_arrow_primitives.ts";
import { generateConnectorPrimitives } from "./generate_connector_primitives.ts";
import { generateErrorBarPrimitives } from "./generate_error_bar_primitives.ts";
import { generateLinePrimitives } from "./generate_line_primitives.ts";
import { generatePointPrimitives } from "./generate_point_primitives.ts";
import type { Orientation } from "./orientation_helpers.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import type { SubChart } from "../sub_charts.ts";

export function generateContentPrimitives(
  subChart: Extract<SubChart, { kind: "category-and-value" }>,
  p: {
    seriesValues: (number | undefined)[][];
    uncertaintyUbSeriesValues?: (number | undefined)[][];
    uncertaintyLbSeriesValues?: (number | undefined)[][];
    orientation: Orientation;
    itemDataDimensions: ChartItemDataDimensions;
    contentStyle: ContentGenerationContext["contentStyle"];
    gridLineStrokeWidth: number;
  },
): Primitive[] {
  const { content } = subChart;
  const { seriesValues, gridLineStrokeWidth, orientation } = p;
  const mapValues = (values: (number | undefined)[][]) =>
    calculateMappedCoordinates(
      values,
      subChart,
      gridLineStrokeWidth,
      orientation,
    );

  const mapped = mapValues(seriesValues);
  const mappedUncertaintyUb = p.uncertaintyUbSeriesValues
    ? mapValues(p.uncertaintyUbSeriesValues)
    : undefined;
  const mappedUncertaintyLb = p.uncertaintyLbSeriesValues
    ? mapValues(p.uncertaintyLbSeriesValues)
    : undefined;

  const ctx: ContentGenerationContext = {
    subChart,
    orientation,
    gridLineStrokeWidth,
    itemDataDimensions: p.itemDataDimensions,
    contentStyle: p.contentStyle,
    mappedUncertaintyUb,
    mappedUncertaintyLb,
  };

  const bars = generateBarPrimitives(mapped, content, ctx);
  const marks = [...generatePointPrimitives(mapped, content, ctx), ...bars];
  return [
    ...marks,
    ...generateCascadeArrowPrimitives(bars, content, ctx),
    ...generateErrorBarPrimitives(marks, content, ctx),
    ...generateLinePrimitives(mapped, content, ctx),
    ...generateAreaPrimitives(mapped, content, ctx),
    ...generateConnectorPrimitives(mapped, content, ctx),
  ];
}
