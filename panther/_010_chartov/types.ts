// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartValueAxisLimits,
  CustomFigureStyle,
  DataDimension,
  DimensionMembership,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  Measured,
  MeasuredSurrounds,
  MemberSortConfig,
  MergedChartOVStyle,
  PaneLayout,
  Primitive,
  UncertaintyConfig,
} from "./deps.ts";

export type ChartOVInputs = FigureInputsBase & {
  figureType: "chart-ov";
  data: ChartOVData;
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
  // indicators (slots) and lanes both stack along x. "tier" carries
  // the y value axis limits and is never allowed on ChartOV.
  membership?: {
    indicator?: DimensionMembership;
    lane?: DimensionMembership;
  };
  // Proportional (ragged-table) layout. lanes: each lane is sized by its own
  // visible indicator count (per-lane visibility implied), uniform slot
  // thickness within a pane. panes: pane widths are additionally
  // proportional to their slot totals, uniform slot thickness across the
  // whole chart (implies lanes; engaged only when the pane grid is a single
  // row). Distinct from membership, which stays per-pane.
  proportional?: {
    lanes?: boolean;
    panes?: boolean;
  };
  labelReplacements?: Record<string, string>;
  sort?: {
    indicator?: MemberSortConfig;
    series?: MemberSortConfig;
    lane?: MemberSortConfig;
    tier?: MemberSortConfig;
    pane?: MemberSortConfig;
  };
  sortIndicatorValues?: "ascending" | "descending" | "none";
  yValueAxisLabel?: string;
};

///////////////////////
//                   //
//    Transformed    //
//                   //
///////////////////////

export type ChartOVDataTransformed = {
  isTransformed: true;
  // One dimension per prop given; with no prop there is none, and values are
  // one member long there.
  indicator: DataDimension;
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
  // Per-pane indicator masks (global indices, in this pane's slot order),
  // present under unbalanced indicator membership, proportional lanes, or a
  // value sort (then a full permutation per pane). Absent = every pane shows
  // the full global set in storage order. Storage (values/uncertaintyValues) stays dense.
  visibleIndicatorsByPane?: number[][];
  // Per-pane visible lane subsets (global indices), present only for
  // unbalanced lane membership. Same masking model as indicators: dropped
  // lanes are whole sub-chart columns.
  visibleLanesByPane?: number[][];
  // Per-(pane, lane) visible indicator subsets for proportional lane layout,
  // indexed [pane][GLOBAL lane index][visible global indicator indices]. A
  // lane with [] in a pane is dropped for that pane. Present only when
  // proportional layout is enabled.
  visibleIndicatorsByPaneLane?: number[][][];
  // Cross-pane proportional sizing requested (proportional.panes). Pane
  // widths become proportional to their slot totals when the pane grid is a
  // single row; otherwise falls back to uniform pane sizing.
  proportionalPanes?: boolean;
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

export type MeasuredChartOV = Measured<ChartOVInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  transformedData: ChartOVDataTransformed;
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedChartOVStyle;
  title?: string;
  subtitle?: string;
  footnote?: string | string[];
  legend?: LegendInput;
  primitives: Primitive[];
  paneLayouts: PaneLayout[];
};
