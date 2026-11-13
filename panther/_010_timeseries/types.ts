// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartValueAxisLimits,
  CustomFigureStyle,
  DataDimension,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  Measured,
  MeasuredSurrounds,
  MemberSortConfig,
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
    series?: MemberSortConfig;
    lane?: MemberSortConfig;
    tier?: MemberSortConfig;
    pane?: MemberSortConfig;
  };
  yValueAxisLabel?: string;
};

///////////////////////
//                   //
//    Transformed    //
//                   //
///////////////////////

export type TimeseriesDataTransformed = {
  isTransformed: true;
  // The period dimension: its name and the time points it spans, from timeMin.
  period: {
    name: string;
    periodType: PeriodType;
    timeMin: number;
    nTimePoints: number;
    nBlankRows: number; // rows left off the plot because their period is blank
  };
  // One dimension per prop given; with no prop there is none, and values are
  // one member long there.
  series?: DataDimension;
  lane?: DataDimension;
  tier?: DataDimension;
  pane?: DataDimension;
  values: (number | undefined)[][][][][];
  uncertaintyValues?: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  };
  valueAxisLimits: ChartValueAxisLimits;
  yValueAxisLabel?: string;
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
  title?: string;
  subtitle?: string;
  footnote?: string | string[];
  legend?: LegendInput;
  primitives: Primitive[];
  paneLayouts: PaneLayout[];
};
