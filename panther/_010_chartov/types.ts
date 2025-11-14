// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  CustomFigureStyle,
  FigureInputsBase,
  JsonArray,
  LegendItem,
  Measured,
  MeasuredPaneBase,
  MeasuredSurrounds,
  MergedChartOVStyle,
  Primitive,
  RectCoordsDims,
  XTextAxisMeasuredInfo,
  YScaleAxisData,
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
  //
  sortHeaders?: boolean | string[];
  sortIndicatorValues?: "ascending" | "descending" | "none";
  labelReplacementsBeforeSorting?: Record<string, string>;
  labelReplacementsAfterSorting?: Record<string, string>;
};

///////////////////////
//                   //
//    Transformed    //
//                   //
///////////////////////

export type ChartOVDataTransformed = {
  isTransformed: true;
  indicatorHeaders: string[];
  seriesHeaders: string[];
  laneHeaders: string[];
  paneHeaders: string[];
  values: (number | undefined)[][][][][];
  yScaleAxisData: YScaleAxisData;
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
  // Measured state
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  mPanes: MeasuredPaneBase[];
  // Computed data
  transformedData: ChartOVDataTransformed;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedChartOVStyle;
  // Display data
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legendItemsOrLabels?: LegendItem[] | string[];
  // Primitives
  primitives: Primitive[];
};
