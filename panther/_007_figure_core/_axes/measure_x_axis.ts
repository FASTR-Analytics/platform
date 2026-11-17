// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type DimensionMember,
  type MergedGridStyle,
  RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type { YAxisWidthInfo } from "../types.ts";
import type { XAxisConfig } from "./axis_configs.ts";
import { measureXPeriodAxis } from "./x_period/measure.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import {
  measureXValueAxisHeightInfo,
  measureXValueAxisLayout,
} from "./x_value/measure.ts";
import type { XValueAxisMeasuredInfo } from "./x_value/types.ts";
import { measureXTextAxis } from "./x_text/measure.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";

export type XNoneAxisMeasuredInfo = {
  uniformSubChartWidth: number;
  xAxisRcd: RectCoordsDims;
};

export type XAxisMeasuredInfo =
  | XTextAxisMeasuredInfo
  | XPeriodAxisMeasuredInfo
  | XValueAxisMeasuredInfo
  | XNoneAxisMeasuredInfo;

export function measureXAxis(
  rc: RenderContext,
  innerRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfo,
  uniformSubChartWidth: number,
  xAxisConfig: XAxisConfig,
  gridStyle: MergedGridStyle,
  i_pane: number,
  nLanes: number,
  // This pane's indicator order (a subset under unbalanced membership, a
  // permutation under a value sort); text axis only. See measureXTextAxis for
  // the extent/layout split.
  visibleIndicatorMembers?: DimensionMember[],
  // Proportional tier-or-lane layout: the uniform slot width (slotExtent); text axis only.
  slotExtentOverride?: number,
): XAxisMeasuredInfo {
  switch (xAxisConfig.type) {
    case "text":
      return measureXTextAxis(
        rc,
        innerRcd,
        yAxisWidthInfo,
        uniformSubChartWidth,
        xAxisConfig.indicatorMembers,
        xAxisConfig.axisStyle,
        gridStyle,
        visibleIndicatorMembers,
        slotExtentOverride,
      );
    case "period":
      return measureXPeriodAxis(
        rc,
        innerRcd,
        yAxisWidthInfo,
        uniformSubChartWidth,
        xAxisConfig.periodType,
        xAxisConfig.nTimePoints,
        xAxisConfig.axisStyle,
        gridStyle,
      );
    case "value": {
      const xValueAxisHeightInfo = measureXValueAxisHeightInfo(
        rc,
        xAxisConfig.axisData,
        xAxisConfig.axisLabel,
        xAxisConfig.axisStyle,
        gridStyle,
        innerRcd,
        i_pane,
        nLanes,
      );
      return measureXValueAxisLayout(
        innerRcd,
        yAxisWidthInfo.widthIncludingYAxisStrokeWidth,
        xValueAxisHeightInfo,
        uniformSubChartWidth,
      );
    }
    case "none": {
      const xStart = innerRcd.x() +
        yAxisWidthInfo.widthIncludingYAxisStrokeWidth;
      return {
        uniformSubChartWidth,
        xAxisRcd: new RectCoordsDims({
          x: xStart,
          y: innerRcd.bottomY(),
          w: innerRcd.rightX() - xStart,
          h: 0,
        }),
      };
    }
  }
}
