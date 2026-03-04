// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedContentStyle,
  Primitive,
  RectCoordsDims,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { calculateMappedCoordinates } from "./calculate_mapped_coordinates.ts";
import type { ContentGenerationContext } from "./content_generation_types.ts";
import { generateAreaPrimitives } from "./generate_area_primitives.ts";
import { generateBarPrimitives } from "./generate_bar_primitives.ts";
import { generateLinePrimitives } from "./generate_line_primitives.ts";
import { generatePointPrimitives } from "./generate_point_primitives.ts";
import { resolveDataLabelOwnership } from "./resolve_data_label_ownership.ts";
import type { ValueRange } from "../types.ts";

export type ContentPrimitiveGenerationParams = {
  rc: RenderContext;
  subChartRcd: RectCoordsDims;
  subChartInfo: {
    nSerieses: number;
    seriesValArrays: (number | undefined)[][];
    i_pane: number;
    nPanes: number;
    i_tier: number;
    nTiers: number;
    i_lane: number;
    nLanes: number;
  };
  seriesVals: (number | undefined)[][];
  valueRange: ValueRange;
  isCentered: boolean;
  incrementWidth: number;
  gridStrokeWidth: number;
  nVals: number;
  orientation: "vertical" | "horizontal";
  transformedData: { seriesHeaders: string[] };
  contentStyle: MergedContentStyle;
  dataLabelsTextStyle: TextInfoUnkeyed;
  boundsUbSeriesVals?: (number | undefined)[][];
  boundsLbSeriesVals?: (number | undefined)[][];
};

export function generateContentPrimitives(
  params: ContentPrimitiveGenerationParams,
): Primitive[] {
  const {
    rc,
    subChartRcd,
    subChartInfo,
    seriesVals,
    valueRange,
    isCentered,
    incrementWidth,
    gridStrokeWidth,
    nVals,
    orientation,
    transformedData: d,
    contentStyle: s,
  } = params;

  const mapped = calculateMappedCoordinates(
    seriesVals,
    subChartRcd,
    incrementWidth,
    isCentered,
    gridStrokeWidth,
    valueRange,
    orientation,
  );

  const nSeries = mapped.length;

  const mappedBoundsUb = params.boundsUbSeriesVals
    ? calculateMappedCoordinates(
      params.boundsUbSeriesVals,
      subChartRcd,
      incrementWidth,
      isCentered,
      gridStrokeWidth,
      valueRange,
      orientation,
    )
    : undefined;

  const mappedBoundsLb = params.boundsLbSeriesVals
    ? calculateMappedCoordinates(
      params.boundsLbSeriesVals,
      subChartRcd,
      incrementWidth,
      isCentered,
      gridStrokeWidth,
      valueRange,
      orientation,
    )
    : undefined;

  const ctx: ContentGenerationContext = {
    rc,
    subChartRcd,
    subChartInfo,
    nVals,
    nSeries,
    orientation,
    incrementWidth,
    gridStrokeWidth,
    seriesHeaders: d.seriesHeaders,
    contentStyle: s,
    dataLabelsTextStyle: params.dataLabelsTextStyle,
    mappedBoundsUb,
    mappedBoundsLb,
  };

  const labelOwner = resolveDataLabelOwnership(mapped, ctx);

  return [
    ...generatePointPrimitives(mapped, labelOwner, ctx),
    ...generateBarPrimitives(mapped, labelOwner, ctx),
    ...generateLinePrimitives(mapped, labelOwner, ctx),
    ...generateAreaPrimitives(mapped, ctx),
  ];
}
