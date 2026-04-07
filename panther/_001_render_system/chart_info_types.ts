// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type ChartSeriesInfo = {
  i_series: number;
  isFirstSeries: boolean;
  isLastSeries: boolean;
  seriesHeader: string;
  nSerieses: number;
  seriesValArrays: (number | undefined)[][];
  nVals: number;
  i_pane: number;
  nPanes: number;
  i_tier: number;
  nTiers: number;
  i_lane: number;
  nLanes: number;
};

export type ChartSeriesInfoFunc<T> = (info: ChartSeriesInfo) => T;

export type ChartValueInfo = ChartSeriesInfo & {
  val: number | undefined;
  i_val: number;
  isFirstVal: boolean;
  isLastVal: boolean;
  valueMin: number;
  valueMax: number;
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
  rowHeader: string;
  colHeader: string;
};

export type TableCellInfoFunc<T> = (info: TableCellInfo) => T;
