// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AxisMembership,
  ChartScaleAxisLimits,
  CustomFigureStyle,
  FigureInputsBase,
  HeaderItem,
  HeaderSortConfig,
  JsonArray,
  LegendInput,
  Measured,
  MeasuredSurrounds,
  MergedChartOHStyle,
  PaneLayout,
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
  // Raggedness is allowed only along the categorical (y-text) direction:
  // indicators (slots) and tiers (bands) both stack along y. "lane" carries
  // the x-scale limits and is never allowed on ChartOH.
  membership?: {
    indicator?: AxisMembership;
    tier?: AxisMembership;
  };
  // Proportional (ragged-table) layout. bands: each tier band is sized by
  // its own visible indicator count (per-band visibility implied), uniform
  // slot thickness within a pane. panes: pane heights are additionally
  // proportional to their slot totals, uniform slot thickness across the
  // whole chart (implies bands; engaged only when the pane grid is a single
  // column). Distinct from membership, which stays per-pane.
  proportional?: {
    bands?: boolean;
    panes?: boolean;
  };
  labelReplacements?: Record<string, string>;
  sort?: {
    indicator?: HeaderSortConfig;
    series?: HeaderSortConfig;
    lane?: HeaderSortConfig;
    tier?: HeaderSortConfig;
    pane?: HeaderSortConfig;
  };
  sortIndicatorValues?: "ascending" | "descending" | "none";
  xScaleAxisLabel?: string;
};

export type ChartOHDataTransformed = {
  isTransformed: true;
  indicatorHeaders: HeaderItem[]; // Y categories
  seriesHeaders: HeaderItem[];
  laneHeaders: HeaderItem[];
  tierHeaders: HeaderItem[];
  paneHeaders: HeaderItem[];
  values: (number | undefined)[][][][][]; // [pane][tier][lane][series][indicator]
  bounds?: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  };
  scaleAxisLimits: ChartScaleAxisLimits;
  xScaleAxisLabel?: string;
  // Per-pane visible indicator subsets (global indices, in global sorted
  // order), present only for unbalanced indicator membership. Absent = every
  // pane shows the full global set. Storage (values/bounds) stays dense.
  visibleIndicatorsByPane?: number[][];
  // Per-pane visible tier subsets (global indices), present only for
  // unbalanced tier membership. Same masking model as indicators: dropped
  // tiers are whole subchart rows.
  visibleTiersByPane?: number[][];
  // Per-(pane, tier) visible indicator subsets for proportional band layout,
  // indexed [pane][GLOBAL tier index][visible global indicator indices]. A
  // tier with [] in a pane is dropped for that pane. Present only when
  // proportional layout is enabled.
  visibleIndicatorsByPaneBand?: number[][][];
  // Cross-pane proportional sizing requested (proportional.panes). Pane
  // heights become proportional to their slot totals when the pane grid is a
  // single column; otherwise falls back to uniform pane sizing.
  proportionalPanes?: boolean;
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
  paneLayouts: PaneLayout[];
};
