// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  FigureInputsBase,
  HeaderItem,
  HeaderSortConfig,
  JsonArray,
  MeasuredChartBase,
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

// The denominator a cell's shares are computed against. "sum" (the default)
// normalises by the cell's own total, so the circle is always 100% of the
// cell; a number declares a fixed envelope, exactly as yScaleAxis.max declares
// one for a bar chart.
export type PieTotal = number | "sum";

export type PieJsonDataConfig = {
  valueProps: string[];
  // The slice dimension. Parts-of-a-whole are series everywhere else in
  // panther (stacked bars stack series), and a pie is one stacked bar in polar
  // coordinates — so slices are series, and get the categorical legend and
  // id-stable swatch colors for free.
  seriesProp?: string | "--v";
  paneProp?: string | "--v";
  tierProp?: string | "--v";
  laneProp?: string | "--v";
  total?: PieTotal;
  labelReplacements?: Record<string, string>;
  sort?: {
    series?: HeaderSortConfig;
    pane?: HeaderSortConfig;
    tier?: HeaderSortConfig;
    lane?: HeaderSortConfig;
  };
  // Reorders the GLOBAL series axis by each series' summed value across every
  // cell. Named after the axis it reorders, like sortIndicatorValues on
  // ChartOV — but keyed on global sums rather than one reference cell, because
  // a pie has no "first series" to key on. Global order keeps one legend and a
  // stable color identity; per-cell orders would break both.
  sortSeriesValues?: "ascending" | "descending" | "none";
  // Collapses every series whose share of the GLOBAL sum across every cell is
  // below `threshold` into one synthetic slice (id "--other", display label
  // `label` ?? "Other"), summing their values per cell. The criterion is
  // global, never per-cell: the series axis is global (one legend, one
  // seriesColorFunc identity), so a series is grouped everywhere or nowhere.
  // The grouped slice sorts last regardless of sort/sortSeriesValues.
  groupSmallSlices?: { threshold: number; label?: string };
};

export type PieDataTransformed = {
  isTransformed: true;
  seriesHeaders: HeaderItem[];
  paneHeaders: HeaderItem[];
  tierHeaders: HeaderItem[];
  laneHeaders: HeaderItem[];
  // [pane][tier][lane][series][value] — the last axis is the library-wide
  // value dimension, length 1 for v1 (a pie is one stacked bar). Keeping it
  // is what lets fillValuesWithDuplicateCheck be reused verbatim, makes
  // values[pane][tier][lane] literally the seriesValArrays ChartSeriesInfo
  // wants, and keeps concentric rings / sunburst a non-breaking change to
  // this stored, schema-validated shape.
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
