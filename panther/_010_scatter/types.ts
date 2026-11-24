// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartValueAxisLimits,
  DataDimension,
  FigureInputsBase,
  JsonArray,
  MeasuredChartBase,
  MemberSortConfig,
  MergedScatterStyle,
  ReferenceLine,
  SubChartTextDataConfig,
} from "./deps.ts";

export type ScatterInputs = FigureInputsBase & {
  figureType: "scatter";
  data: ScatterData;
};

export type ScatterData = ScatterDataJson | ScatterDataTransformed;

export type ScatterDataJson = {
  jsonArray: JsonArray;
  jsonDataConfig: ScatterJsonDataConfig;
};

// A scatter's axes are named x and y, and neither is first or second.
export type ScatterReferenceLineDataConfig = ReferenceLine & {
  valueAxis: "x" | "y";
};

export function scatterReferenceLinesOn(
  referenceLines: ScatterReferenceLineDataConfig[] | undefined,
  valueAxis: "x" | "y",
): ReferenceLine[] {
  return (referenceLines ?? []).filter((line) => line.valueAxis === valueAxis);
}

// Every dimension prop names a column: the two value props are the two axes,
// never a dimension's members, so no prop splits by them.
export type ScatterJsonDataConfig = {
  xValueProp: string;
  yValueProp: string;
  indicatorProp?: string;
  seriesProp?: string;
  laneProp?: string;
  tierProp?: string;
  paneProp?: string;
  labelReplacements?: Record<string, string>;
  sort?: {
    indicator?: MemberSortConfig;
    series?: MemberSortConfig;
    lane?: MemberSortConfig;
    tier?: MemberSortConfig;
    pane?: MemberSortConfig;
  };
  xValueAxisLabel?: string;
  yValueAxisLabel?: string;
  referenceLines?: ScatterReferenceLineDataConfig[];
  subChartTexts?: SubChartTextDataConfig[];
};

export type ScatterDataTransformed = {
  isTransformed: true;
  // One dimension per prop given; with no prop there is none, and the
  // tensors are one member long there.
  indicator?: DataDimension;
  series?: DataDimension;
  lane?: DataDimension;
  tier?: DataDimension;
  pane?: DataDimension;
  // [pane][tier][lane][series][indicator]; a point is drawn where both of its
  // cells are defined.
  xValues: (number | undefined)[][][][][];
  yValues: (number | undefined)[][][][][];
  xValueAxisLimits: ChartValueAxisLimits;
  yValueAxisLimits: ChartValueAxisLimits;
  xValueAxisLabel?: string;
  yValueAxisLabel?: string;
  referenceLines?: ScatterReferenceLineDataConfig[];
  subChartTexts?: SubChartTextDataConfig[];
};

export type MeasuredScatter = MeasuredChartBase<
  ScatterInputs,
  ScatterDataTransformed,
  MergedScatterStyle
>;

export function isScatterDataTransformed(
  d: ScatterData,
): d is ScatterDataTransformed {
  return "isTransformed" in d && d.isTransformed === true;
}
