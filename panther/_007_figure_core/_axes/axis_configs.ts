// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DimensionMember,
  MergedXPeriodAxisStyle,
  MergedXTextAxisStyle,
  MergedXValueAxisStyle,
  MergedYTextAxisStyle,
  MergedYValueAxisStyle,
  PeriodType,
} from "../deps.ts";
import type { ChartValueAxisLimits } from "../types.ts";

export type XAxisConfig =
  | {
    type: "text";
    indicatorMembers: DimensionMember[];
    axisStyle: MergedXTextAxisStyle;
  }
  | {
    type: "period";
    // The period's dimension, which names the items of its time points.
    dimension: string;
    periodType: PeriodType;
    nTimePoints: number;
    timeMin: number;
    axisStyle: MergedXPeriodAxisStyle;
  }
  | {
    type: "value";
    axisStyle: MergedXValueAxisStyle;
    axisData: ChartValueAxisLimits;
    axisLabel?: string;
  };

export type YAxisConfig =
  | {
    type: "value";
    axisStyle: MergedYValueAxisStyle;
    axisData: ChartValueAxisLimits;
    axisLabel?: string;
  }
  | {
    type: "text";
    indicatorMembers: DimensionMember[];
    axisStyle: MergedYTextAxisStyle;
  };

export type XCategoryAxisConfig = Extract<
  XAxisConfig,
  { type: "text" | "period" }
>;
export type XValueAxisConfig = Extract<XAxisConfig, { type: "value" }>;
export type YCategoryAxisConfig = Extract<YAxisConfig, { type: "text" }>;
export type YValueAxisConfig = Extract<YAxisConfig, { type: "value" }>;

export type ChartAxesConfig =
  | {
    kind: "category-and-value";
    orientation: "vertical";
    x: XCategoryAxisConfig;
    y: YValueAxisConfig;
  }
  | {
    kind: "category-and-value";
    orientation: "horizontal";
    x: XValueAxisConfig;
    y: YCategoryAxisConfig;
  }
  | { kind: "none" };
