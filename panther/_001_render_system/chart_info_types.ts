// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DimensionMember } from "./dimension_types.ts";

export type ChartSeriesInfo = {
  i_series: number;
  isFirstSeries: boolean;
  isLastSeries: boolean;
  seriesMember: DimensionMember | undefined;
  nSerieses: number;
  seriesValueArrays: (number | undefined)[][];
  nValues: number;
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

export type ChartSeriesInfoFunc<T> = (info: ChartSeriesInfo) => T;

export type ChartValueInfo = ChartSeriesInfo & {
  value: number | undefined;
  i_value: number;
  isFirstValue: boolean;
  isLastValue: boolean;
  valueMin: number;
  valueMax: number;
  // For category charts (chartov/chartoh) this is the indicator at i_value.
  // For timeseries, i_value is a time point and this is undefined.
  indicatorMember: DimensionMember | undefined;
};

export type ChartValueInfoFunc<T> = (info: ChartValueInfo) => T;

export type CascadeArrowInfo = ChartSeriesInfo & {
  i_arrow: number;
  nArrows: number;
  isFirstArrow: boolean;
  isLastArrow: boolean;
  fromValue: number;
  toValue: number;
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
  // slice belongs to (mirrors ChartValueInfo's i_value/indicatorMember).
  i_indicator: number;
  nIndicators: number;
  indicatorMember: DimensionMember | undefined;
};

export type PieSliceInfoFunc<T> = (info: PieSliceInfo) => T;

export type ChartConnectorInfo = {
  i_value: number;
  isFirstValue: boolean;
  isLastValue: boolean;
  valueMin: number;
  valueMax: number;
  nValues: number;
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
  // Endpoint info — parallel arrays describing each point on the connector,
  // in series order, after gap filtering.
  seriesIndices: number[];
  seriesMembers: (DimensionMember | undefined)[];
  values: number[];
};

export type ChartConnectorInfoFunc<T> = (info: ChartConnectorInfo) => T;

export type MapAreaInfo = {
  featureId: string;
  value: number | undefined;
  valueMin: number;
  valueMax: number;
  featureProperties: Record<string, unknown>;
  i_pane: number;
  i_tier: number;
  i_lane: number;
  paneMember: DimensionMember | undefined;
  tierMember: DimensionMember | undefined;
  laneMember: DimensionMember | undefined;
};

export type MapAreaInfoFunc<T> = (info: MapAreaInfo) => T;

export type TableCellInfo = {
  value: string | number;
  valueAsNumber: number | undefined;
  valueMin: number;
  valueMax: number;
  i_row: number;
  i_col: number;
  nRows: number;
  nCols: number;
  rowMember: DimensionMember | undefined;
  colMember: DimensionMember | undefined;
  // The group headers spanning this cell, undefined when that side carries no
  // groups. A cell knows all four of its members: which dimension a consumer
  // maps onto a group dimension is its choice, so a formatter that must identify
  // the cell by a dimension value cannot be blind to half the layout.
  rowGroupMember: DimensionMember | undefined;
  colGroupMember: DimensionMember | undefined;
  // Sample size (n) for this cell, from TableDataTransformed.nMatrix.
  sampleN?: number;
};

export type TableCellInfoFunc<T> = (info: TableCellInfo) => T;

// Sample-size digest for one header's slice of nMatrix. first/min/max/varies
// exclude non-numeric cells (undefined, and null/NaN/Infinity normalized away
// at the read boundary) and cells whose PERPENDICULAR header id is in
// liveDomainExcludeIds. Exclusion is perpendicular ONLY: a group header's
// digest keeps roll-up members that sit on its own side within its span (a
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
// funcs, TableCellInfo.rowMember/colMember/rowGroupMember/colGroupMember,
// primitive metadata, MeasuredTable.transformedData, resolveTableHeaders
// output — sees the RESOLVED label. `id` is the raw match key everywhere.
export type TableHeaderInfo = {
  id: string | undefined;
  label: string;
  index: number | undefined;
  nRowsOrCols: number;
  isGroupHeader: boolean;
  sampleN?: TableHeaderSampleN;
};

export type TableHeaderInfoFunc<T> = (info: TableHeaderInfo) => T;
