// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartSeriesInfo,
  ChartValueInfo,
  DataLabelStyle,
  DimensionMember,
  MergedContentStyle,
  RectCoordsDims,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { getAdjustedFont, getColor } from "../deps.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import type { OverhangClearance, ValueRange } from "../types.ts";
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
    seriesValueArrays: (number | undefined)[][];
    i_pane: number;
    nPanes: number;
    paneMember: DimensionMember | undefined;
    i_tier: number;
    nTiers: number;
    tierMember: DimensionMember | undefined;
    i_lane: number;
    nLanes: number;
    laneMember: DimensionMember | undefined;
  };
  nValues: number;
  // This unit's slot order: the global indicator index at each slot. The
  // identity when the chart is balanced and unsorted; a subset under
  // unbalanced membership; a permutation under a value sort.
  slotOrder: number[];
  nSerieses: number;
  orientation: "vertical" | "horizontal";
  slotExtent: number;
  gridLineStrokeWidth: number;
  // The chart's data dimensions, which name both the members the style funcs see
  // and the items the primitives stand for.
  itemDataDimensions: ChartItemDataDimensions;
  contentStyle: MergedContentStyle;
  dataLabelsTextStyle: TextInfoUnkeyed;
  valueRange: ValueRange;
  valueClearance: OverhangClearance;
  mappedUncertaintyUb?: MappedValueCoordinate[][];
  mappedUncertaintyLb?: MappedValueCoordinate[][];
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
    seriesMember: ctx.itemDataDimensions.series?.members[i_series],
    nValues: seriesArrays[i_series].length,
  };
}

export function buildValueInfo(
  ctx: ContentGenerationContext,
  seriesInfo: ChartSeriesInfo,
  value: number,
  i_value: number,
): ChartValueInfo {
  return {
    ...seriesInfo,
    value,
    i_value,
    isFirstValue: i_value === ctx.slotOrder[0],
    isLastValue: i_value === ctx.slotOrder[ctx.slotOrder.length - 1],
    valueMin: ctx.valueRange.valueMin,
    valueMax: ctx.valueRange.valueMax,
    indicatorMember: ctx.itemDataDimensions.indicator?.members[i_value],
  };
}
