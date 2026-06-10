// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartSeriesInfo,
  ChartValueInfo,
  HeaderItem,
  MergedContentStyle,
  RectCoordsDims,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import type { OverhangClearance } from "../types.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";

export type ContentGenerationContext = {
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
  nVals: number;
  nSeries: number;
  orientation: "vertical" | "horizontal";
  categoryIncrement: number;
  gridStrokeWidth: number;
  seriesHeaders: HeaderItem[];
  indicatorHeaders?: HeaderItem[];
  contentStyle: MergedContentStyle;
  dataLabelsTextStyle: TextInfoUnkeyed;
  valueRange: { minVal: number; maxVal: number };
  valueClearance: OverhangClearance;
  mappedBoundsUb?: MappedValueCoordinate[][];
  mappedBoundsLb?: MappedValueCoordinate[][];
};

export type DataLabelOwner = "points" | "bars" | "lines" | "none";
export type DataLabelOwnershipMap = DataLabelOwner[][];

export function buildSeriesInfo(
  ctx: ContentGenerationContext,
  i_series: number,
  seriesArrays: readonly unknown[][],
): ChartSeriesInfo {
  return {
    ...ctx.subChartInfo,
    i_series,
    isFirstSeries: i_series === 0,
    isLastSeries: i_series === ctx.subChartInfo.nSerieses - 1,
    seriesHeader: ctx.seriesHeaders[i_series],
    nVals: seriesArrays[i_series].length,
  };
}

export function buildValueInfo(
  seriesInfo: ChartSeriesInfo,
  val: number,
  i_val: number,
  valueMin: number,
  valueMax: number,
  indicatorHeader: HeaderItem | undefined,
): ChartValueInfo {
  return {
    ...seriesInfo,
    val,
    i_val,
    isFirstVal: i_val === 0,
    isLastVal: i_val === seriesInfo.nVals - 1,
    valueMin,
    valueMax,
    indicatorHeader,
  };
}
