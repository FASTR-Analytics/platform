// Copyright 2023-2025, Tim Roberton, All rights reserved.
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
};

export type TableCellInfoFunc<T> = (info: TableCellInfo) => T;
