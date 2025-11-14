// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  FigureInputsBase,
  JsonArray,
  LegendItem,
  Measured,
  MeasuredPaneBase,
  MeasuredSurrounds,
  MergedTimeseriesStyle,
  PeriodType,
  Primitive,
  RectCoordsDims,
  XPeriodAxisMeasuredInfo,
  YScaleAxisData,
} from "./deps.ts";

export type TimeseriesInputs = FigureInputsBase & {
  timeseriesData: TimeseriesData;
};

export type TimeseriesData =
  // | TimeseriesDataCsv
  TimeseriesDataJson | TimeseriesDataTransformed;

////////////////
//            //
//    Json    //
//            //
////////////////

export type TimeseriesDataJson = {
  jsonArray: JsonArray;
  jsonDataConfig: TimeseriesJsonDataConfig;
};

export type TimeseriesJsonDataConfig = {
  valueProps: string[];
  periodProp: string | "--v";
  periodType: PeriodType;
  seriesProp?: string | "--v";
  laneProp?: string | "--v";
  tierProp?: string | "--v";
  paneProp?: string | "--v";
  //
  sortHeaders?: boolean | string[];
  labelReplacementsBeforeSorting?: Record<string, string>;
  labelReplacementsAfterSorting?: Record<string, string>;
  yScaleAxisLabel?: string;
};

///////////////////////
//                   //
//    Transformed    //
//                   //
///////////////////////

export type TimeseriesDataTransformed = {
  isTransformed: true;
  periodType: PeriodType;
  timeMin: number;
  timeMax: number;
  nTimePoints: number;
  seriesHeaders: string[];
  laneHeaders: string[];
  paneHeaders: string[];
  values: (number | undefined)[][][][][];
  yScaleAxisData: YScaleAxisData;
};

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

// export function isTimeseriesDataCsv(d: TimeseriesData): d is TimeseriesDataCsv {
//   return (d as TimeseriesDataCsv).csv !== undefined;
// }

export function isTimeseriesDataJson(
  d: TimeseriesData,
): d is TimeseriesDataJson {
  return (d as TimeseriesDataJson).jsonArray !== undefined;
}

export function isTimeseriesDataTransformed(
  d: TimeseriesData,
): d is TimeseriesDataTransformed {
  return (d as TimeseriesDataTransformed).isTransformed === true;
}

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

export type MeasuredTimeseries = Measured<TimeseriesInputs> & {
  // Measured state
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  mPanes: MeasuredPaneBase[];
  // Computed data
  transformedData: TimeseriesDataTransformed;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedTimeseriesStyle;
  // Display data
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legendItemsOrLabels?: LegendItem[] | string[];
  // Primitives
  primitives: Primitive[];
};
