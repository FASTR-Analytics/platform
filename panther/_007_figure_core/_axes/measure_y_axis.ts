// Copyright 2023-2026, Tim Roberton. MIT license.
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
import type { XValueAxisHeightInfo } from "./x_value/types.ts";
import {
  measureYValueAxis,
  measureYValueAxisWidthInfo,
} from "./y_value/measure.ts";
import { measureYTextAxisWidthInfo } from "./y_text/measure.ts";

export function measureYAxisWidthInfo(
  rc: RenderContext,
  yAxisConfig: YAxisConfig,
  gridStyle: MergedGridStyle,
  innerRcd: RectCoordsDims,
  iPane: number,
  tierHeaderAndLabelGapWidth: number,
  nTiers: number,
): YAxisWidthInfo {
  switch (yAxisConfig.type) {
    case "value":
      return measureYValueAxisWidthInfo(
        rc,
        yAxisConfig.axisData,
        yAxisConfig.axisLabel,
        yAxisConfig.axisStyle,
        gridStyle,
        innerRcd,
        iPane,
        tierHeaderAndLabelGapWidth,
        nTiers,
      );
    case "text":
      return measureYTextAxisWidthInfo(
        rc,
        yAxisConfig.indicatorMembers,
        yAxisConfig.axisStyle,
        gridStyle,
        innerRcd,
        tierHeaderAndLabelGapWidth,
      );
    case "none":
      return { widthIncludingYAxisStrokeWidth: 0, halfYAxisTickLabelH: 0 };
  }
}

export function measureYAxisLayout(
  topHeightForLaneHeaders: number,
  xAxisHeight: number,
  yAxisWidthInfo: YAxisWidthInfo,
  tiers: { paddingTop: number; paddingBottom: number; gapY: number },
  innerRcd: RectCoordsDims,
  nTiers: number,
  tierHeaderAndLabelGapHeight: number,
): { yAxisRcd: RectCoordsDims; uniformSubChartHeight: number } {
  return measureYValueAxis(
    topHeightForLaneHeaders,
    xAxisHeight,
    yAxisWidthInfo,
    tiers,
    innerRcd,
    nTiers,
    tierHeaderAndLabelGapHeight,
  );
}

export function getValueAxisValueRange(
  yAxisWidthInfo: YAxisWidthInfo,
  iTier: number,
): ValueRange {
  if ("yAxisTickValues" in yAxisWidthInfo) {
    return {
      valueMin: yAxisWidthInfo.yAxisTickValues[iTier]?.at(0) ?? 0,
      valueMax: yAxisWidthInfo.yAxisTickValues[iTier]?.at(-1) ?? 1,
    };
  }
  throw new Error("Value range extraction not implemented for Y-text axis");
}

export function getXValueAxisValueRange(
  xValueAxisHeightInfo: XValueAxisHeightInfo,
  iLane: number,
): ValueRange {
  return {
    valueMin: xValueAxisHeightInfo.xAxisTickValues[iLane]?.at(0) ?? 0,
    valueMax: xValueAxisHeightInfo.xAxisTickValues[iLane]?.at(-1) ?? 1,
  };
}
