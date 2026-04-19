// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartScaleAxisLimits,
  CustomFigureStyle,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  Measured,
  MeasuredSurrounds,
  MergedChartOHStyle,
  Primitive,
  UncertaintyConfig,
} from "./deps.ts";

export type ChartOHInputs = FigureInputsBase & {
  chartOHData: ChartOHData;
};

export type ChartOHData = ChartOHDataJson | ChartOHDataTransformed;

export type ChartOHDataJson = {
  jsonArray: JsonArray;
  jsonDataConfig: ChartOHJsonDataConfig;
};

export type ChartOHJsonDataConfig = {
  valueProps: string[];
  indicatorProp: string | "--v";
  seriesProp?: string | "--v";
  laneProp?: string | "--v";
  tierProp?: string | "--v";
  paneProp?: string | "--v";
  uncertainty?: UncertaintyConfig;
  sortHeaders?: boolean | string[];
  sortIndicatorValues?: "ascending" | "descending" | "none";
  labelReplacementsBeforeSorting?: Record<string, string>;
  labelReplacementsAfterSorting?: Record<string, string>;
  xScaleAxisLabel?: string;
};

export type ChartOHDataTransformed = {
  isTransformed: true;
  indicatorHeaders: string[]; // Y categories
  seriesHeaders: string[];
  laneHeaders: string[];
  tierHeaders: string[];
  paneHeaders: string[];
  values: (number | undefined)[][][][][]; // [pane][tier][lane][series][indicator]
  bounds?: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  };
  scaleAxisLimits: ChartScaleAxisLimits;
  xScaleAxisLabel?: string;
};

export function isChartOHDataJson(d: ChartOHData): d is ChartOHDataJson {
  return (d as ChartOHDataJson).jsonArray !== undefined;
}

export function isChartOHDataTransformed(
  d: ChartOHData,
): d is ChartOHDataTransformed {
  return (d as ChartOHDataTransformed).isTransformed === true;
}

export type MeasuredChartOH = Measured<ChartOHInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  transformedData: ChartOHDataTransformed;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedChartOHStyle;
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legend?: LegendInput;
  primitives: Primitive[];
};
