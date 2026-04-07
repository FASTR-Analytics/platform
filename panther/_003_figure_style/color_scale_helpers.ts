// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color } from "./deps.ts";
import type {
  ChartSeriesInfoFunc,
  ColorKeyOrString,
  ContinuousScaleConfig,
  ScaleConfig,
  ValuesColorFunc,
} from "./deps.ts";

export function valuesColorScale(
  config: ContinuousScaleConfig,
  noDataColor?: ColorKeyOrString,
): ValuesColorFunc {
  const nd: ColorKeyOrString = noDataColor ?? "#f0f0f0";
  return (value, min, max) => {
    if (value === undefined) return nd;
    return Color.scaleContinuous(config, value, min, max);
  };
}

export function seriesColorScale(
  config: ScaleConfig,
): ChartSeriesInfoFunc<ColorKeyOrString> {
  return (info) => Color.scaleDiscrete(config, info.i_series, info.nSerieses);
}

export function paneColorScale(
  config: ScaleConfig,
): ChartSeriesInfoFunc<ColorKeyOrString> {
  return (info) => Color.scaleDiscrete(config, info.i_pane, info.nPanes);
}

export function laneColorScale(
  config: ScaleConfig,
): ChartSeriesInfoFunc<ColorKeyOrString> {
  return (info) => Color.scaleDiscrete(config, info.i_lane, info.nLanes);
}

export function tierColorScale(
  config: ScaleConfig,
): ChartSeriesInfoFunc<ColorKeyOrString> {
  return (info) => Color.scaleDiscrete(config, info.i_tier, info.nTiers);
}
