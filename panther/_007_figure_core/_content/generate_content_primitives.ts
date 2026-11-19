// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedContentStyle,
  Primitive,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { calculateMappedCoordinates } from "./calculate_mapped_coordinates.ts";
import type { ContentGenerationContext } from "./content_generation_types.ts";
import { generateAreaPrimitives } from "./generate_area_primitives.ts";
import { generateBarPrimitives } from "./generate_bar_primitives.ts";
import { generateConnectorPrimitives } from "./generate_connector_primitives.ts";
import { generateErrorBarPrimitives } from "./generate_error_bar_primitives.ts";
import { generateLinePrimitives } from "./generate_line_primitives.ts";
import { generatePointPrimitives } from "./generate_point_primitives.ts";
import { resolveDataLabelOwnership } from "./resolve_data_label_ownership.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import type { SubChart } from "../sub_charts.ts";

export function generateContentPrimitives(
  rc: RenderContext,
  subChart: Extract<SubChart, { kind: "category-and-value" }>,
  p: {
    subChartInfo: ContentGenerationContext["subChartInfo"];
    seriesValues: (number | undefined)[][];
    uncertaintyUbSeriesValues?: (number | undefined)[][];
    uncertaintyLbSeriesValues?: (number | undefined)[][];
    orientation: "vertical" | "horizontal";
    itemDataDimensions: ChartItemDataDimensions;
    contentStyle: MergedContentStyle;
    dataLabelsTextStyle: TextInfoUnkeyed;
    gridLineStrokeWidth: number;
  },
): Primitive[] {
  const {
    rcd,
    valueRange,
    valueClearance,
    isCentered,
    slotExtent,
    nValues,
    slotOrder,
    positionOrdinals,
  } = subChart;
  const { seriesValues, gridLineStrokeWidth, orientation } = p;

  const mapped = calculateMappedCoordinates(
    seriesValues,
    rcd,
    slotExtent,
    isCentered,
    gridLineStrokeWidth,
    valueRange,
    valueClearance,
    orientation,
    positionOrdinals,
  );

  const nSerieses = mapped.length;

  const mappedUncertaintyUb = p.uncertaintyUbSeriesValues
    ? calculateMappedCoordinates(
      p.uncertaintyUbSeriesValues,
      rcd,
      slotExtent,
      isCentered,
      gridLineStrokeWidth,
      valueRange,
      valueClearance,
      orientation,
      positionOrdinals,
    )
    : undefined;

  const mappedUncertaintyLb = p.uncertaintyLbSeriesValues
    ? calculateMappedCoordinates(
      p.uncertaintyLbSeriesValues,
      rcd,
      slotExtent,
      isCentered,
      gridLineStrokeWidth,
      valueRange,
      valueClearance,
      orientation,
      positionOrdinals,
    )
    : undefined;

  const ctx: ContentGenerationContext = {
    rc,
    subChartRcd: rcd,
    subChartInfo: p.subChartInfo,
    nValues,
    slotOrder,
    nSerieses,
    orientation,
    slotExtent,
    gridLineStrokeWidth,
    itemDataDimensions: p.itemDataDimensions,
    contentStyle: p.contentStyle,
    dataLabelsTextStyle: p.dataLabelsTextStyle,
    valueRange,
    valueClearance,
    mappedUncertaintyUb,
    mappedUncertaintyLb,
  };

  const labelOwner = resolveDataLabelOwnership(seriesValues, ctx);

  const marks = [
    ...generatePointPrimitives(mapped, labelOwner, ctx),
    ...generateBarPrimitives(mapped, labelOwner, ctx),
  ];
  return [
    ...marks,
    ...generateErrorBarPrimitives(marks, ctx),
    ...generateLinePrimitives(mapped, labelOwner, ctx),
    ...generateAreaPrimitives(mapped, ctx),
    ...generateConnectorPrimitives(mapped, ctx),
  ];
}
