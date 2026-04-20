// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type MergedGridStyle,
  RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type { YAxisWidthInfo } from "../types.ts";
import type { XAxisConfig } from "./axis_configs.ts";
import { measureXPeriodAxis } from "./x_period/measure.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import {
  measureXScaleAxisHeightInfo,
  measureXScaleAxisLayout,
} from "./x_scale/measure.ts";
import type { XScaleAxisMeasuredInfo } from "./x_scale/types.ts";
import { measureXTextAxis } from "./x_text/measure.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";

export type XAxisType = "text" | "period" | "scale";

export type XNoneAxisMeasuredInfo = {
  subChartAreaWidth: number;
  xAxisRcd: RectCoordsDims;
};

export type XAxisMeasuredInfo =
  | XTextAxisMeasuredInfo
  | XPeriodAxisMeasuredInfo
  | XScaleAxisMeasuredInfo
  | XNoneAxisMeasuredInfo;

export function measureXAxis(
  rc: RenderContext,
  contentRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfo,
  subChartAreaWidth: number,
  xAxisConfig: XAxisConfig,
  gridStyle: MergedGridStyle,
  i_pane: number,
  laneCount: number,
): XAxisMeasuredInfo {
  switch (xAxisConfig.type) {
    case "text":
      return measureXTextAxis(
        rc,
        contentRcd,
        yAxisWidthInfo,
        subChartAreaWidth,
        xAxisConfig.indicatorHeaders,
        xAxisConfig.axisStyle,
        gridStyle,
      );
    case "period":
      return measureXPeriodAxis(
        rc,
        contentRcd,
        yAxisWidthInfo,
        subChartAreaWidth,
        xAxisConfig.periodType,
        xAxisConfig.nTimePoints,
        xAxisConfig.axisStyle,
        gridStyle,
      );
    case "scale": {
      const xScaleHeightInfo = measureXScaleAxisHeightInfo(
        rc,
        xAxisConfig.axisData,
        xAxisConfig.axisStyle,
        gridStyle,
        contentRcd,
        i_pane,
        laneCount,
      );
      return measureXScaleAxisLayout(
        contentRcd,
        yAxisWidthInfo.widthIncludingYAxisStrokeWidth,
        xScaleHeightInfo,
        subChartAreaWidth,
      );
    }
    case "none": {
      const xStart = contentRcd.x() +
        yAxisWidthInfo.widthIncludingYAxisStrokeWidth;
      return {
        subChartAreaWidth,
        xAxisRcd: new RectCoordsDims({
          x: xStart,
          y: contentRcd.bottomY(),
          w: contentRcd.rightX() - xStart,
          h: 0,
        }),
      };
    }
  }
}
