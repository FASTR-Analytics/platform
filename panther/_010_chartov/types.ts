// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AxisMembership,
  ChartScaleAxisLimits,
  ColorKeyOrString,
  CustomFigureStyle,
  FigureInputsBase,
  HeaderItem,
  HeaderSortConfig,
  JsonArray,
  LegendInput,
  Measured,
  MeasuredSurrounds,
  MergedChartOVStyle,
  PaneLayout,
  Primitive,
  UncertaintyConfig,
} from "./deps.ts";

export type ChartOVInputs = FigureInputsBase & {
  chartData: ChartOVData;
};

export type ChartOVData = ChartOVDataJson | ChartOVDataTransformed;

////////////////
//            //
//    Json    //
//            //
////////////////

export type ChartOVDataJson = {
  jsonArray: JsonArray;
  jsonDataConfig: ChartOVJsonDataConfig;
};

export type ChartOVJsonDataConfig = {
  valueProps: string[];
  indicatorProp: string | "--v";
  seriesProp?: string | "--v";
  laneProp?: string | "--v";
  tierProp?: string | "--v";
  paneProp?: string | "--v";
  uncertainty?: UncertaintyConfig;
  // Raggedness is allowed only along the categorical (x-text) direction:
  // indicators (slots) and lanes (bands) both stack along x. "tier" carries
  // the y-scale limits and is never allowed on ChartOV.
  membership?: {
    indicator?: AxisMembership;
    lane?: AxisMembership;
  };
  //
  labelReplacements?: Record<string, string>;
  sort?: {
    indicator?: HeaderSortConfig;
    series?: HeaderSortConfig;
    lane?: HeaderSortConfig;
    tier?: HeaderSortConfig;
    pane?: HeaderSortConfig;
  };
  sortIndicatorValues?: "ascending" | "descending" | "none";
  yScaleAxisLabel?: string;
};

///////////////////////
//                   //
//    Transformed    //
//                   //
///////////////////////

export type ChartOVDataTransformed = {
  isTransformed: true;
  indicatorHeaders: HeaderItem[];
  seriesHeaders: HeaderItem[];
  laneHeaders: HeaderItem[];
  tierHeaders: HeaderItem[];
  paneHeaders: HeaderItem[];
  values: (number | undefined)[][][][][];
  bounds?: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  };
  scaleAxisLimits: ChartScaleAxisLimits;
  yScaleAxisLabel?: string;
  // Per-pane visible indicator subsets (global indices, in global sorted
  // order), present only for unbalanced indicator membership. Absent = every
  // pane shows the full global set. Storage (values/bounds) stays dense.
  visibleIndicatorsByPane?: number[][];
  // Per-pane visible lane subsets (global indices), present only for
  // unbalanced lane membership. Same masking model as indicators: dropped
  // lanes are whole subchart columns.
  visibleLanesByPane?: number[][];
};

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

// export function isChartOVDataCsv(d: ChartOVData): d is ChartOVDataCsv {
//   return (d as ChartOVDataCsv).csv !== undefined;
// }

export function isChartOVDataJson(d: ChartOVData): d is ChartOVDataJson {
  return (d as ChartOVDataJson).jsonArray !== undefined;
}

export function isChartOVDataTransformed(
  d: ChartOVData,
): d is ChartOVDataTransformed {
  return (d as ChartOVDataTransformed).isTransformed === true;
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

export type ChartPossibleHeights = {
  minH: number;
  preferredH: number;
  maxH: number;
};

export type ColGroupExpanded = {
  display: boolean;
  label: string;
  cols: ColGroupExpandedCol[];
};

export type ColGroupExpandedCol = {
  colIndexInAoA: number;
  coords: {
    x: number;
    cx: number;
    y: number;
    cy: number;
    w: number;
    h: number;
  };
};

export type Coords = {
  x: number;
  y: number;
};

export type OutlineColInfo = {
  color: ColorKeyOrString;
  coords: { xLeft: number; xRight: number; y: number }[];
};

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

export type ChartHeightInfo = {
  ideal: number;
  max?: number;
  min?: number;
};

///////////////////////////////////////////////////////////////////////////////////////////////////////
//  __       __                                                                  __                   //
// /  \     /  |                                                                /  |                  //
// $$  \   /$$ |  ______    ______    _______  __    __   ______    ______    ____$$ |                //
// $$$  \ /$$$ | /      \  /      \  /       |/  |  /  | /      \  /      \  /    $$ |                //
// $$$$  /$$$$ |/$$$$$$  | $$$$$$  |/$$$$$$$/ $$ |  $$ |/$$$$$$  |/$$$$$$  |/$$$$$$$ |                //
// $$ $$ $$/$$ |$$    $$ | /    $$ |$$      \ $$ |  $$ |$$ |  $$/ $$    $$ |$$ |  $$ |                //
// $$ |$$$/ $$ |$$$$$$$$/ /$$$$$$$ | $$$$$$  |$$ \__$$ |$$ |      $$$$$$$$/  $$ \__$$ |                //
// $$ | $/  $$ |$$       |$$    $$ |/     $$/ $$    $$/ $$ |      $$       |$$    $$ |                //
// $$/      $$/  $$$$$$$/  $$$$$$$/ $$$$$$$/   $$$$$$/  $$/        $$$$$$$/  $$$$$$$$/                 //
//                                                                                                     //
///////////////////////////////////////////////////////////////////////////////////////////////////////

export type MeasuredChartOV = Measured<ChartOVInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  transformedData: ChartOVDataTransformed;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedChartOVStyle;
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legend?: LegendInput;
  primitives: Primitive[];
  paneLayouts: PaneLayout[];
};
