// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartSeriesInfo,
  ChartValueInfo,
  DataLabelStyle,
  HeaderItem,
  MergedContentStyle,
  RectCoordsDims,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { getAdjustedFont, getColor } from "../deps.ts";
import type { ChartItemAxes } from "../chart_items.ts";
import type { OverhangClearance } from "../types.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";

// One home for deriving a data label's text style from its host's base text
// style + per-label overrides. Used by every content generator AND by
// measure_data_label_clearance.ts — measurement and rendering must agree on
// label dimensions.
export function buildDataLabelTextStyle(
  base: TextInfoUnkeyed,
  dl: Pick<DataLabelStyle, "color" | "relFontSize" | "font">,
): TextInfoUnkeyed {
  if (
    dl.color === undefined &&
    dl.relFontSize === 1 &&
    Object.keys(dl.font).length === 0
  ) {
    return base;
  }
  return {
    ...base,
    ...(dl.color !== undefined ? { color: getColor(dl.color) } : {}),
    fontSize: base.fontSize * dl.relFontSize,
    font: getAdjustedFont(base.font, dl.font),
  };
}

export type ContentGenerationContext = {
  rc: RenderContext;
  subChartRcd: RectCoordsDims;
  subChartInfo: {
    nSerieses: number;
    seriesValArrays: (number | undefined)[][];
    i_pane: number;
    nPanes: number;
    paneHeader: HeaderItem | undefined;
    i_tier: number;
    nTiers: number;
    tierHeader: HeaderItem | undefined;
    i_lane: number;
    nLanes: number;
    laneHeader: HeaderItem | undefined;
  };
  nVals: number;
  // This unit's slot order: the global indicator index at each slot. The
  // identity when the chart is balanced and unsorted; a subset under
  // unbalanced membership; a permutation under a value sort.
  slotOrder: number[];
  nSeries: number;
  orientation: "vertical" | "horizontal";
  categoryIncrement: number;
  gridStrokeWidth: number;
  // The chart's slot axes, which name both the headers the style funcs see
  // and the items the primitives stand for.
  itemAxes: ChartItemAxes;
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
    seriesHeader: ctx.itemAxes.series?.headers[i_series],
    nVals: seriesArrays[i_series].length,
  };
}

export function buildValueInfo(
  ctx: ContentGenerationContext,
  seriesInfo: ChartSeriesInfo,
  val: number,
  i_val: number,
): ChartValueInfo {
  return {
    ...seriesInfo,
    val,
    i_val,
    isFirstVal: i_val === ctx.slotOrder[0],
    isLastVal: i_val === ctx.slotOrder[ctx.slotOrder.length - 1],
    valueMin: ctx.valueRange.minVal,
    valueMax: ctx.valueRange.maxVal,
    indicatorHeader: ctx.itemAxes.indicator?.headers[i_val],
  };
}
