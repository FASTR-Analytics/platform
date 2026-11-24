// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  RectCoordsDims,
  RenderContext,
} from "../deps.ts";
import type {
  YAxisConfig,
  YCategoryAxisConfig,
  YValueAxisConfig,
} from "./axis_configs.ts";
import type { ValueRange, YValueAxisWidthInfo } from "../types.ts";
import {
  measureSecondYValueAxisWidthInfo,
  measureYValueAxisWidthInfo,
} from "./y_value/measure.ts";
import { measureYTextAxisWidthInfo } from "./y_text/measure.ts";
import type { YTextAxisWidthInfo } from "./y_text/types.ts";

export type MeasuredYAxis =
  | {
    type: "value";
    config: Extract<YAxisConfig, { type: "value" }>;
    info: YValueAxisWidthInfo;
  }
  | {
    type: "text";
    config: Extract<YAxisConfig, { type: "text" }>;
    info: YTextAxisWidthInfo;
  };

export function measureYValueAxis(
  rc: RenderContext,
  config: YValueAxisConfig,
  gridStyle: MergedGridStyle,
  innerRcd: RectCoordsDims,
  iPane: number,
  tierHeaderAndLabelGapWidth: number,
  nTiers: number,
): Extract<MeasuredYAxis, { type: "value" }> {
  return {
    type: "value",
    config,
    info: measureYValueAxisWidthInfo(
      rc,
      config.axisData,
      config.axisLabel,
      config.axisStyle,
      gridStyle,
      innerRcd,
      iPane,
      tierHeaderAndLabelGapWidth,
      nTiers,
    ),
  };
}

export function measureSecondYValueAxis(
  rc: RenderContext,
  config: YValueAxisConfig,
  gridStyle: MergedGridStyle,
  firstAxis: Extract<MeasuredYAxis, { type: "value" }>,
  iPane: number,
): Extract<MeasuredYAxis, { type: "value" }> {
  return {
    type: "value",
    config,
    info: measureSecondYValueAxisWidthInfo(
      rc,
      config.axisData,
      config.axisLabel,
      config.axisStyle,
      gridStyle,
      iPane,
      firstAxis.info.yAxisTickValues,
    ),
  };
}

export function measureYCategoryAxis(
  rc: RenderContext,
  config: YCategoryAxisConfig,
  gridStyle: MergedGridStyle,
  innerRcd: RectCoordsDims,
  tierHeaderAndLabelGapWidth: number,
): Extract<MeasuredYAxis, { type: "text" }> {
  return {
    type: "text",
    config,
    info: measureYTextAxisWidthInfo(
      rc,
      config.indicatorMembers,
      config.axisStyle,
      gridStyle,
      innerRcd,
      tierHeaderAndLabelGapWidth,
    ),
  };
}

// The tiers stand below the lane headers and, on a horizontal chart with a
// second x value axis, below that axis's strip, and above the x axis.
export function measureYAxisLayout(
  topHeightForLaneHeaders: number,
  secondXAxisHeight: number,
  xAxisHeight: number,
  yAxisWidth: number,
  tiers: { paddingTop: number; paddingBottom: number; gapY: number },
  innerRcd: RectCoordsDims,
  nTiers: number,
  tierHeaderAndLabelGapHeight: number,
): { yAxisRcd: RectCoordsDims; uniformSubChartHeight: number } {
  const heightAboveTiers = topHeightForLaneHeaders + secondXAxisHeight;
  const yAxisRcd = innerRcd.getAdjusted((prev) => ({
    y: prev.y() + heightAboveTiers,
    w: yAxisWidth,
    h: prev.h() - (heightAboveTiers + xAxisHeight),
  }));

  const uniformSubChartHeight = (yAxisRcd.h() -
    (tiers.paddingTop +
      (nTiers - 1) * tiers.gapY +
      tiers.paddingBottom +
      nTiers * tierHeaderAndLabelGapHeight)) /
    nTiers;

  return { yAxisRcd, uniformSubChartHeight };
}

export function getValueAxisValueRange(
  yAxis: Extract<MeasuredYAxis, { type: "value" }>,
  iTier: number,
): ValueRange {
  const tickValues = yAxis.info.yAxisTickValues[iTier];
  return {
    valueMin: tickValues?.at(0) ?? 0,
    valueMax: tickValues?.at(-1) ?? 1,
  };
}
