// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  RectCoordsDims,
  RenderContext,
} from "../deps.ts";
import type { YAxisConfig } from "./axis_configs.ts";
import type { ValueRange, YAxisWidthInfo } from "../types.ts";
import {
  measureYScaleAxis,
  measureYScaleAxisWidthInfo,
} from "./y_scale/measure.ts";

export function measureYAxisWidthInfo(
  rc: RenderContext,
  yAxisConfig: YAxisConfig,
  gridStyle: MergedGridStyle,
  contentRcd: RectCoordsDims,
  iPane: number,
  tierHeaderAndLabelGapWidth: number,
  tierCount: number,
): YAxisWidthInfo {
  switch (yAxisConfig.type) {
    case "scale":
      return measureYScaleAxisWidthInfo(
        rc,
        yAxisConfig.axisData,
        yAxisConfig.axisStyle,
        gridStyle,
        contentRcd,
        iPane,
        tierHeaderAndLabelGapWidth,
        tierCount,
      );
    case "text":
      throw new Error("Y-text axis measurement not implemented yet");
  }
}

export function measureYAxisLayout(
  topHeightForLaneHeaders: number,
  xAxisAreaHeight: number,
  yAxisWidthInfo: YAxisWidthInfo,
  tiers: { paddingTop: number; paddingBottom: number; gapY: number },
  contentRcd: RectCoordsDims,
  tierCount: number,
): { yAxisRcd: RectCoordsDims; subChartAreaHeight: number } {
  return measureYScaleAxis(
    topHeightForLaneHeaders,
    xAxisAreaHeight,
    yAxisWidthInfo,
    tiers,
    contentRcd,
    tierCount,
  );
}

export function getScaleAxisValueRange(
  yAxisWidthInfo: YAxisWidthInfo,
  iTier: number,
): ValueRange {
  if ("yAxisTickValues" in yAxisWidthInfo) {
    return {
      minVal: yAxisWidthInfo.yAxisTickValues[iTier]?.at(0) ?? 0,
      maxVal: yAxisWidthInfo.yAxisTickValues[iTier]?.at(-1) ?? 1,
    };
  }
  throw new Error("Value range extraction not implemented for Y-text axis");
}
