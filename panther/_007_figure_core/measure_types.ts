// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  MeasuredText,
  MergedChartStyleBase,
  Primitive,
  RectCoordsDims,
} from "./deps.ts";
import type { LegendItem } from "./_legend/types.ts";
import type { LegendInput } from "./_legend/scale_legend_types.ts";
import type { MeasuredSurrounds } from "./_surrounds/measure_surrounds.ts";
import type { XAxisConfig, YAxisConfig } from "./_axes/axis_configs.ts";

export type { MeasuredSurrounds };

export interface SimplifiedChartConfig<
  TInputs,
  TData,
  TStyle extends MergedChartStyleBase,
> {
  mergedStyle: TStyle;
  transformedData: TData;
  dataProps: {
    paneHeaders: string[];
    tierHeaders: string[];
    laneHeaders: string[];
    seriesHeaders: string[];
  };
  xAxisConfig: XAxisConfig;
  yAxisConfig: YAxisConfig;
  orientation: "vertical" | "horizontal";
  resolvedLegend?: LegendInput;
}

export interface MeasurePaneConfig<TData> {
  indices: {
    pane: number;
    row: number;
    col: number;
  };
  geometry: {
    outerRcd: RectCoordsDims;
    contentRcd: RectCoordsDims;
  };
  paneHeader: MeasuredText | undefined;
  dataProps: {
    paneHeaders: string[];
    tierHeaders: string[];
    laneHeaders: string[];
    seriesHeaders: string[];
  };
  data: TData;
  baseStyle: MergedChartStyleBase;
  xAxisConfig: XAxisConfig;
  yAxisConfig: YAxisConfig;
  orientation: "vertical" | "horizontal";
}

export interface MeasuredChartBase<TInputs, TData, TStyle> {
  item: TInputs;
  bounds: RectCoordsDims;
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  transformedData: TData;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: TStyle;
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legend?: LegendInput;
  primitives: Primitive[];
}
