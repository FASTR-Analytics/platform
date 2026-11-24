// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartValueAxis,
  DataDimension,
  DimensionMember,
  MergedXPeriodAxisStyle,
  MergedXTextAxisStyle,
  MergedXValueAxisStyle,
  MergedYTextAxisStyle,
  MergedYValueAxisStyle,
  PeriodType,
} from "../deps.ts";
import type {
  ChartValueAxisLimits,
  ReferenceLine,
  ReferenceLineDataConfig,
  SecondValueAxisDataTransformed,
} from "../types.ts";

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
    referenceLines: ReferenceLine[];
  };

export type YAxisConfig =
  | {
    type: "value";
    axisStyle: MergedYValueAxisStyle;
    axisData: ChartValueAxisLimits;
    axisLabel?: string;
    referenceLines: ReferenceLine[];
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
    secondY?: YValueAxisConfig & { seriesMemberIds: string[] };
  }
  | {
    kind: "category-and-value";
    orientation: "horizontal";
    x: XValueAxisConfig;
    y: YCategoryAxisConfig;
    secondX?: XValueAxisConfig & { seriesMemberIds: string[] };
  }
  | { kind: "value-and-value"; x: XValueAxisConfig; y: YValueAxisConfig }
  | { kind: "none" };

export function referenceLinesOn(
  referenceLines: ReferenceLineDataConfig[] | undefined,
  valueAxis: ChartValueAxis,
): ReferenceLine[] {
  return (referenceLines ?? []).filter((line) =>
    (line.valueAxis ?? "first") === valueAxis
  );
}

export function buildSecondValueAxisConfig<
  TAxisStyle extends MergedYValueAxisStyle | MergedXValueAxisStyle,
>(
  secondValueAxis: SecondValueAxisDataTransformed | undefined,
  axisStyle: TAxisStyle,
  referenceLines: ReferenceLineDataConfig[] | undefined,
):
  | {
    type: "value";
    axisStyle: TAxisStyle;
    axisData: ChartValueAxisLimits;
    axisLabel?: string;
    referenceLines: ReferenceLine[];
    seriesMemberIds: string[];
  }
  | undefined {
  return secondValueAxis && {
    type: "value",
    axisStyle,
    axisData: secondValueAxis.valueAxisLimits,
    axisLabel: secondValueAxis.axisLabel,
    referenceLines: referenceLinesOn(referenceLines, "second"),
    seriesMemberIds: secondValueAxis.seriesMemberIds,
  };
}

export type ValueAxisOfSeries = (i_series: number) => ChartValueAxis;

export function getValueAxisOfSeries(
  series: DataDimension | undefined,
  secondValueAxisSeriesMemberIds: string[] | undefined,
): ValueAxisOfSeries {
  const assigned = new Set(secondValueAxisSeriesMemberIds);
  return (i_series) => {
    const id = series?.members[i_series]?.id;
    return id !== undefined && assigned.has(id) ? "second" : "first";
  };
}

export function getSecondValueAxisSeriesMemberIds(
  axes: ChartAxesConfig,
): string[] | undefined {
  if (axes.kind !== "category-and-value") {
    return undefined;
  }
  return axes.orientation === "vertical"
    ? axes.secondY?.seriesMemberIds
    : axes.secondX?.seriesMemberIds;
}
