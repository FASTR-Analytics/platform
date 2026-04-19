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
  opts?: { steps?: number; noDataColor?: ColorKeyOrString },
): ValuesColorFunc {
  const nd: ColorKeyOrString = opts?.noDataColor ?? "#f0f0f0";
  const steps = opts?.steps;
  return (value, min, max) => {
    if (value === undefined) return nd;
    if (steps !== undefined && steps >= 2) {
      if (max === min) return Color.scaleContinuous(config, value, min, max);
      const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
      const stepIndex = Math.min(steps - 1, Math.floor(t * steps));
      const snappedT = steps === 1 ? 0.5 : stepIndex / (steps - 1);
      const snappedValue = min + snappedT * (max - min);
      return Color.scaleContinuous(config, snappedValue, min, max);
    }
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
