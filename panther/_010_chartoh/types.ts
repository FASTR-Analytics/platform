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
  MergedChartOHStyle,
  PaneLayout,
  Primitive,
  UncertaintyConfig,
} from "./deps.ts";

export type ChartOHInputs = FigureInputsBase & {
  figureType: "chart-oh";
  data: ChartOHData;
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
  // indicators (slots) and tiers both stack along y. "lane" carries
  // the x value axis limits and is never allowed on ChartOH.
  membership?: {
    indicator?: DimensionMembership;
    tier?: DimensionMembership;
  };
  // Proportional (ragged-table) layout. tiers: each tier is sized by its own
  // visible indicator count (per-tier visibility implied), uniform slot
  // thickness within a pane. panes: pane heights are additionally
  // proportional to their slot totals, uniform slot thickness across the
  // whole chart (implies tiers; engaged only when the pane grid is a single
  // column). Distinct from membership, which stays per-pane.
  proportional?: {
    tiers?: boolean;
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
  xValueAxisLabel?: string;
};

export type ChartOHDataTransformed = {
  isTransformed: true;
  // One dimension per prop given; with no prop there is none, and values are
  // one member long there. The indicators are the Y categories.
  indicator: DataDimension;
  series?: DataDimension;
  lane?: DataDimension;
  tier?: DataDimension;
  pane?: DataDimension;
  values: (number | undefined)[][][][][]; // [pane][tier][lane][series][indicator]
  uncertaintyValues?: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  };
  valueAxisLimits: ChartValueAxisLimits;
  xValueAxisLabel?: string;
  // Per-pane indicator masks (global indices, in this pane's slot order),
  // present under unbalanced indicator membership, proportional tiers, or a
  // value sort (then a full permutation per pane). Absent = every pane shows
  // the full global set in storage order. Storage (values/uncertaintyValues) stays dense.
  visibleIndicatorsByPane?: number[][];
  // Per-pane visible tier subsets (global indices), present only for
  // unbalanced tier membership. Same masking model as indicators: dropped
  // tiers are whole sub-chart rows.
  visibleTiersByPane?: number[][];
  // Per-(pane, tier) visible indicator subsets for proportional tier layout,
  // indexed [pane][GLOBAL tier index][visible global indicator indices]. A
  // tier with [] in a pane is dropped for that pane. Present only when
  // proportional layout is enabled.
  visibleIndicatorsByPaneTier?: number[][][];
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
  title?: string;
  subtitle?: string;
  footnote?: string | string[];
  legend?: LegendInput;
  primitives: Primitive[];
  paneLayouts: PaneLayout[];
};
