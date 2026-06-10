// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  HeaderItem,
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
import { generateConnectorPrimitives } from "./generate_connector_primitives.ts";
import { generateLinePrimitives } from "./generate_line_primitives.ts";
import { generatePointPrimitives } from "./generate_point_primitives.ts";
import { resolveDataLabelOwnership } from "./resolve_data_label_ownership.ts";
import type { OverhangClearance, ValueRange } from "../types.ts";

export type ContentPrimitiveGenerationParams = {
  rc: RenderContext;
  subChartRcd: RectCoordsDims;
  subChartInfo: {
    nSerieses: number;
    seriesValArrays: (number | undefined)[][];
    i_pane: number;
    nPanes: number;
    paneHeader: HeaderItem;
    i_tier: number;
    nTiers: number;
    tierHeader: HeaderItem;
    i_lane: number;
    nLanes: number;
    laneHeader: HeaderItem;
  };
  seriesVals: (number | undefined)[][];
  valueRange: ValueRange;
  valueClearance: OverhangClearance;
  isCentered: boolean;
  categoryIncrement: number;
  gridStrokeWidth: number;
  nVals: number;
  orientation: "vertical" | "horizontal";
  transformedData: {
    seriesHeaders: HeaderItem[];
    indicatorHeaders?: HeaderItem[];
  };
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
    valueClearance,
    isCentered,
    categoryIncrement,
    gridStrokeWidth,
    nVals,
    orientation,
    transformedData: d,
    contentStyle: s,
  } = params;

  const mapped = calculateMappedCoordinates(
    seriesVals,
    subChartRcd,
    categoryIncrement,
    isCentered,
    gridStrokeWidth,
    valueRange,
    valueClearance,
    orientation,
  );

  const nSeries = mapped.length;

  const mappedBoundsUb = params.boundsUbSeriesVals
    ? calculateMappedCoordinates(
      params.boundsUbSeriesVals,
      subChartRcd,
      categoryIncrement,
      isCentered,
      gridStrokeWidth,
      valueRange,
      valueClearance,
      orientation,
    )
    : undefined;

  const mappedBoundsLb = params.boundsLbSeriesVals
    ? calculateMappedCoordinates(
      params.boundsLbSeriesVals,
      subChartRcd,
      categoryIncrement,
      isCentered,
      gridStrokeWidth,
      valueRange,
      valueClearance,
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
    categoryIncrement,
    gridStrokeWidth,
    seriesHeaders: d.seriesHeaders,
    indicatorHeaders: d.indicatorHeaders,
    contentStyle: s,
    dataLabelsTextStyle: params.dataLabelsTextStyle,
    valueRange,
    valueClearance,
    mappedBoundsUb,
    mappedBoundsLb,
  };

  const labelOwner = resolveDataLabelOwnership(seriesVals, ctx);

  return [
    ...generatePointPrimitives(mapped, labelOwner, ctx),
    ...generateBarPrimitives(mapped, labelOwner, ctx),
    ...generateLinePrimitives(mapped, labelOwner, ctx),
    ...generateAreaPrimitives(mapped, ctx),
    ...generateConnectorPrimitives(mapped, ctx),
  ];
}
