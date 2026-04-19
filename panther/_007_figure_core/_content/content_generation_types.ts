// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartSeriesInfo,
  ChartValueInfo,
  MergedContentStyle,
  RectCoordsDims,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";

export type ContentGenerationContext = {
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
  nVals: number;
  nSeries: number;
  orientation: "vertical" | "horizontal";
  categoryIncrement: number;
  gridStrokeWidth: number;
  seriesHeaders: string[];
  contentStyle: MergedContentStyle;
  dataLabelsTextStyle: TextInfoUnkeyed;
  valueRange: { minVal: number; maxVal: number };
  mappedBoundsUb?: MappedValueCoordinate[][];
  mappedBoundsLb?: MappedValueCoordinate[][];
};

export type DataLabelOwner = "points" | "bars" | "lines" | "none";
export type DataLabelOwnershipMap = DataLabelOwner[][];

export function buildSeriesInfo(
  ctx: ContentGenerationContext,
  i_series: number,
  mappedSeriesCoordinates: MappedValueCoordinate[][],
): ChartSeriesInfo {
  return {
    ...ctx.subChartInfo,
    i_series,
    isFirstSeries: i_series === 0,
    isLastSeries: i_series === ctx.subChartInfo.nSerieses - 1,
    seriesHeader: ctx.seriesHeaders[i_series],
    nVals: mappedSeriesCoordinates[i_series].length,
  };
}

export function buildValueInfo(
  seriesInfo: ChartSeriesInfo,
  val: number,
  i_val: number,
  valueMin: number,
  valueMax: number,
): ChartValueInfo {
  return {
    ...seriesInfo,
    val,
    i_val,
    isFirstVal: i_val === 0,
    isLastVal: i_val === seriesInfo.nVals - 1,
    valueMin,
    valueMax,
  };
}
