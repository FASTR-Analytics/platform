// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedChartOVStyle,
  MergedTimeseriesStyle,
  RectCoordsDims,
  RenderContext,
} from "./deps.ts";
import type { YScaleAxisData } from "./types.ts";
import type { XPeriodAxisMeasuredInfo } from "./_axes/x_period/types.ts";
import type { XTextAxisMeasuredInfo } from "./_axes/x_text/types.ts";

// Common interface for X-axis measured info
export interface XAxisMeasuredInfoBase {
  xAxisRcd: RectCoordsDims;
  subChartAreaWidth: number;
}

// Union of all X-axis measured info types
export type XAxisMeasuredInfo = XTextAxisMeasuredInfo | XPeriodAxisMeasuredInfo;

// Base configuration shared across all panes (without pane-specific data)
export interface ChartRenderConfigBase<
  TStyle = MergedChartOVStyle | MergedTimeseriesStyle,
> {
  styles: TStyle;
  data: {
    laneHeaders: string[];
    yScaleAxisData: YScaleAxisData;
    values: (number | undefined)[][][][][]; // [pane][tier][lane][series][time]
  };
  xAxisStyle: {
    lanePaddingLeft: number;
    lanePaddingRight: number;
    laneGapX: number;
  };

  // X-axis configuration (without pane-specific measured info)
  xAxisType: "text" | "period" | "scale";
  xAxisRenderDataBase:
    | {
      type: "text";
      indicatorHeaders: string[];
      mergedStyle: TStyle;
    }
    | {
      type: "period";
      nTimePoints: number;
      timeMin: number;
      periodType: "year-month" | "year-quarter" | "year";
      mergedStyle: TStyle;
    }
    | {
      type: "scale";
      // Future: scale-specific data
    };
}

// Configuration for rendering a single pane (includes pane-specific measured info)
export interface PaneRenderConfig<
  TStyle = MergedChartOVStyle | MergedTimeseriesStyle,
> {
  styles: TStyle;
  data: {
    laneHeaders: string[];
    yScaleAxisData: YScaleAxisData;
    values: (number | undefined)[][][][][]; // [pane][tier][lane][series][time]
  };
  xAxisInfo: XAxisMeasuredInfo;
  xAxisStyle: {
    lanePaddingLeft: number;
    lanePaddingRight: number;
    laneGapX: number;
  };

  // X-axis configuration
  xAxisType: "text" | "period" | "scale";
  xAxisRenderData:
    | {
      type: "text";
      mx: XTextAxisMeasuredInfo;
      indicatorHeaders: string[];
      mergedStyle: TStyle;
    }
    | {
      type: "period";
      mx: XPeriodAxisMeasuredInfo;
      nTimePoints: number;
      timeMin: number;
      periodType: "year-month" | "year-quarter" | "year";
      mergedStyle: TStyle;
    }
    | {
      type: "scale";
      // Future: scale-specific data
    };
}
