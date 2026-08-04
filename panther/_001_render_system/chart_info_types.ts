// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { HeaderItem } from "./header_types.ts";

export type ChartSeriesInfo = {
  i_series: number;
  isFirstSeries: boolean;
  isLastSeries: boolean;
  seriesHeader: HeaderItem;
  nSerieses: number;
  seriesValArrays: (number | undefined)[][];
  nVals: number;
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

export type ChartSeriesInfoFunc<T> = (info: ChartSeriesInfo) => T;

export type ChartValueInfo = ChartSeriesInfo & {
  val: number | undefined;
  i_val: number;
  isFirstVal: boolean;
  isLastVal: boolean;
  valueMin: number;
  valueMax: number;
  // For category charts (chartov/chartoh) this is the indicator at i_val.
  // For timeseries, i_val is a time point and this is undefined.
  indicatorHeader: HeaderItem | undefined;
};

export type ChartValueInfoFunc<T> = (info: ChartValueInfo) => T;

export type CascadeArrowInfo = ChartSeriesInfo & {
  i_arrow: number;
  nArrows: number;
  isFirstArrow: boolean;
  isLastArrow: boolean;
  fromVal: number;
  toVal: number;
  absDropoff: number;
  relDropoff: number;
  relRetention: number;
  isBiggestDropoff: boolean;
};

export type CascadeArrowInfoFunc<T> = (info: CascadeArrowInfo) => T;

// A pie slice IS a series (parts-of-a-whole are series everywhere in panther),
// so its info extends ChartSeriesInfo rather than paralleling it: the same
// object reaches seriesColorFunc, which is what makes the legend swatch and
// the plotted slice provably one colour, and makes a consumer's existing
// seriesColorFunc usable on pies unchanged.
export type PieSliceInfo = ChartSeriesInfo & {
  value: number;
  // value / the DECLARED denominator. With an explicit `total` smaller than
  // the pie's sum this exceeds 1 — geometry still fills the circle, but the
  // true number is carried here so a formatter can print "103%".
  share: number;
  total: number;
  // The repeat dimension: which pie in the sub-chart's indicator grid this
  // slice belongs to (mirrors ChartValueInfo's i_val/indicatorHeader).
  i_indicator: number;
  nIndicators: number;
  indicatorHeader: HeaderItem;
};

export type PieSliceInfoFunc<T> = (info: PieSliceInfo) => T;

export type ChartConnectorInfo = {
  i_val: number;
  isFirstVal: boolean;
  isLastVal: boolean;
  valueMin: number;
  valueMax: number;
  nVals: number;
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
  // Endpoint info — parallel arrays describing each point on the connector,
  // in series order, after gap filtering.
  seriesIndices: number[];
  seriesHeaders: HeaderItem[];
  values: number[];
};

export type ChartConnectorInfoFunc<T> = (info: ChartConnectorInfo) => T;

export type MapRegionInfo = {
  featureId: string;
  value: number | undefined;
  valueMin: number;
  valueMax: number;
  featureProperties: Record<string, unknown>;
  paneIndex: number;
  tierIndex: number;
  laneIndex: number;
  paneHeader: HeaderItem;
  tierHeader: HeaderItem;
  laneHeader: HeaderItem;
};

export type MapRegionInfoFunc<T> = (info: MapRegionInfo) => T;

export type TableCellInfo = {
  value: string | number;
  valueAsNumber: number | undefined;
  valueMin: number;
  valueMax: number;
  i_row: number;
  i_col: number;
  nRows: number;
  nCols: number;
  rowHeader: HeaderItem | undefined;
  colHeader: HeaderItem | undefined;
  // Sample size (n) for this cell, from TableDataTransformed.nMatrix.
  sampleN?: number;
};

export type TableCellInfoFunc<T> = (info: TableCellInfo) => T;

// Sample-size digest for one header's slice of nMatrix. first/min/max/varies
// exclude non-numeric cells (undefined, and null/NaN/Infinity normalized away
// at the read boundary) and cells whose PERPENDICULAR header id is in
// liveDomainExcludeIds. Exclusion is perpendicular ONLY: a group header's
// digest keeps roll-up members that sit on its own axis within its span (a
// "total" row inside a row group still feeds that group's digest). `slice` is
// raw — every cell of the header's slice, in final sorted display order
// (group headers: span flattened item-by-item). Omitted entirely when no
// numeric cell survives exclusion, so every inner field is required.
export type TableHeaderSampleN = {
  first: number;
  min: number;
  max: number;
  varies: boolean;
  slice: (number | undefined)[];
};

// Label semantics: the header textFormatter receives the RAW (pre-format)
// label and returns the final display string; every other consumer — getStyle
// funcs, TableCellInfo.rowHeader/colHeader, primitive metadata,
// MeasuredTable.transformedData, resolveTableHeaders output — sees the
// RESOLVED label. `id` is the raw match key everywhere.
export type TableHeaderInfo = {
  id: string | undefined;
  label: string;
  index: number | undefined;
  itemCount: number;
  isGroupHeader: boolean;
  sampleN?: TableHeaderSampleN;
};

export type TableHeaderInfoFunc<T> = (info: TableHeaderInfo) => T;
