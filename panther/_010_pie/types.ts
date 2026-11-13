// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DataDimension,
  FigureInputsBase,
  JsonArray,
  MeasuredChartBase,
  MemberSortConfig,
  MergedPieStyle,
} from "./deps.ts";

export type PieInputs = FigureInputsBase & {
  figureType: "pie";
  data: PieData;
};

export type PieData = PieDataJson | PieDataTransformed;

export type PieDataJson = {
  jsonArray: JsonArray;
  jsonDataConfig: PieJsonDataConfig;
};

// The denominator a pie's shares are computed against. "sum" (the default)
// normalises by the pie's own total, so the circle is always 100% of the
// pie; a number declares a fixed envelope, exactly as yValueAxis.max declares
// one for a bar chart.
export type PieTotal = number | "sum";

export type PieJsonDataConfig = {
  valueProps: string[];
  // The slice dimension. Parts-of-a-whole are series everywhere else in
  // panther (stacked bars stack series), and a pie is one stacked bar in polar
  // coordinates — so slices are series, and get the categorical legend and
  // id-stable swatch colors for free.
  seriesProp?: string | "--v";
  // The repeat dimension: one pie per indicator, tiled inside each sub-chart.
  // Costs no disaggregation dimension — panes/tiers/lanes stay free.
  indicatorProp?: string | "--v";
  paneProp?: string | "--v";
  tierProp?: string | "--v";
  laneProp?: string | "--v";
  total?: PieTotal;
  labelReplacements?: Record<string, string>;
  sort?: {
    series?: MemberSortConfig;
    indicator?: MemberSortConfig;
    pane?: MemberSortConfig;
    tier?: MemberSortConfig;
    lane?: MemberSortConfig;
  };
  // Reorders the GLOBAL series dimension by each series' summed value across every
  // pie. Named after the dimension it reorders, like sortIndicatorValues on
  // ChartOV — but global where ChartOV's is per pane, because slices are the
  // series dimension: global order keeps one legend and a stable color identity;
  // per-pie orders would break both.
  sortSeriesValues?: "ascending" | "descending" | "none";
  // Collapses every named series whose share of the GLOBAL sum across every
  // pie is below `threshold` into one synthetic slice (id "--other", display
  // label `label` ?? "Other"), summing their values per pie. The criterion is
  // global, never per-pie: the series dimension is global (one legend, one
  // seriesColorFunc identity), so a series is grouped everywhere or nowhere.
  // The grouped slice follows every kept named slice, and the blank slice,
  // never grouped, follows it, regardless of sort/sortSeriesValues.
  groupSmallSlices?: { threshold: number; label?: string };
};

export type PieDataTransformed = {
  isTransformed: true;
  // One dimension per prop given; with no prop there is none, and values are
  // one member long there.
  series?: DataDimension;
  indicator?: DataDimension;
  pane?: DataDimension;
  tier?: DataDimension;
  lane?: DataDimension;
  // [pane][tier][lane][series][indicator] — literally ChartOV's shape. The
  // last index is the repeat dimension (one pie per indicator, length 1 with no
  // indicatorProp), which keeps fillValuesWithDuplicateCheck reused verbatim
  // and values[pane][tier][lane] literally the seriesValueArrays
  // ChartSeriesInfo wants.
  values: (number | undefined)[][][][][];
  total: PieTotal;
};

export type MeasuredPie = MeasuredChartBase<
  PieInputs,
  PieDataTransformed,
  MergedPieStyle
>;

export function isPieDataTransformed(d: PieData): d is PieDataTransformed {
  return "isTransformed" in d;
}
