// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartScaleAxisLimits,
  CustomFigureStyle,
  DataAxis,
  FigureInputsBase,
  HeaderSortConfig,
  JsonArray,
  LegendInput,
  Measured,
  MeasuredSurrounds,
  MergedTimeseriesStyle,
  PaneLayout,
  PeriodType,
  Primitive,
  UncertaintyConfig,
} from "./deps.ts";

export type TimeseriesInputs = FigureInputsBase & {
  figureType: "timeseries";
  data: TimeseriesData;
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
  uncertainty?: UncertaintyConfig;
  //
  labelReplacements?: Record<string, string>;
  sort?: {
    series?: HeaderSortConfig;
    lane?: HeaderSortConfig;
    tier?: HeaderSortConfig;
    pane?: HeaderSortConfig;
  };
  yScaleAxisLabel?: string;
};

///////////////////////
//                   //
//    Transformed    //
//                   //
///////////////////////

export type TimeseriesDataTransformed = {
  isTransformed: true;
  // The period axis: its dimension and the time points it spans, from timeMin.
  period: {
    dimension: string;
    periodType: PeriodType;
    timeMin: number;
    nTimePoints: number;
  };
  // One axis per split slot; an unsplit slot has none and is one member long
  // in values.
  series?: DataAxis;
  lane?: DataAxis;
  tier?: DataAxis;
  pane?: DataAxis;
  values: (number | undefined)[][][][][];
  bounds?: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  };
  scaleAxisLimits: ChartScaleAxisLimits;
  yScaleAxisLabel?: string;
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

export type MeasuredTimeseries = Measured<TimeseriesInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  transformedData: TimeseriesDataTransformed;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedTimeseriesStyle;
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legend?: LegendInput;
  primitives: Primitive[];
  paneLayouts: PaneLayout[];
};
