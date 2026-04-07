// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getFormatterFunc, type ValuesColorFunc } from "../deps.ts";
import type {
  ScaleLegendGradientAutoConfig,
  ScaleLegendGradientConfig,
  ScaleLegendSteppedAutoConfig,
  ScaleLegendSteppedConfig,
} from "./scale_legend_types.ts";

const DEFAULT_N_TICKS = 5;
const N_GRADIENT_STOPS = 50;

export function resolveAutoScaleLegend(
  config: ScaleLegendGradientAutoConfig | ScaleLegendSteppedAutoConfig,
  valuesColorFunc: ValuesColorFunc,
  valueRange: { min: number; max: number },
): ScaleLegendGradientConfig | ScaleLegendSteppedConfig {
  const isFixedDomain = config.domain !== undefined;
  const rawDomain = config.domain ?? valueRange;
  if (config.type === "gradient-auto") {
    return resolveGradient(config, valuesColorFunc, rawDomain, isFixedDomain);
  }
  return resolveStepped(config, valuesColorFunc, rawDomain, isFixedDomain);
}

function resolveGradient(
  config: ScaleLegendGradientAutoConfig,
  valuesColorFunc: ValuesColorFunc,
  rawDomain: { min: number; max: number },
  isFixedDomain: boolean,
): ScaleLegendGradientConfig {
  const nTicks = config.nTicks ?? DEFAULT_N_TICKS;

  let niceMin: number;
  let niceMax: number;
  let ticks: number[];

  if (isFixedDomain) {
    niceMin = rawDomain.min;
    niceMax = rawDomain.max;
    ticks = [];
    for (let i = 0; i < nTicks; i++) {
      const t = nTicks === 1 ? 0.5 : i / (nTicks - 1);
      ticks.push(niceMin + t * (niceMax - niceMin));
    }
  } else {
    const nice = getNiceTicks(rawDomain.min, rawDomain.max, nTicks);
    niceMin = nice.min;
    niceMax = nice.max;
    ticks = nice.ticks;
  }

  const stops: ScaleLegendGradientConfig["stops"] = [];
  for (let i = 0; i < N_GRADIENT_STOPS; i++) {
    const t = i / (N_GRADIENT_STOPS - 1);
    const value = niceMin + t * (niceMax - niceMin);
    const color = valuesColorFunc(value, rawDomain.min, rawDomain.max);
    stops.push({ value, color });
  }

  const labelFormatter = config.labelFormatter ??
    buildAutoFormatter(ticks, config.format);

  return {
    type: "gradient",
    stops,
    ticks,
    labelFormatter,
    noData: config.noData,
  };
}

function resolveStepped(
  config: ScaleLegendSteppedAutoConfig,
  valuesColorFunc: ValuesColorFunc,
  rawDomain: { min: number; max: number },
  isFixedDomain: boolean,
): ScaleLegendSteppedConfig {
  let min: number;
  let max: number;

  if (isFixedDomain) {
    min = rawDomain.min;
    max = rawDomain.max;
  } else {
    const nice = getNiceTicks(rawDomain.min, rawDomain.max, config.nSteps + 1);
    min = nice.min;
    max = nice.max;
  }

  const nSteps = config.nSteps;
  const stepSize = (max - min) / nSteps;

  const steps: ScaleLegendSteppedConfig["steps"] = [];
  for (let i = 0; i < nSteps; i++) {
    const stepMin = min + i * stepSize;
    const stepMax = min + (i + 1) * stepSize;
    const midpoint = (stepMin + stepMax) / 2;
    const color = valuesColorFunc(midpoint, rawDomain.min, rawDomain.max);
    steps.push({ min: stepMin, max: stepMax, color });
  }

  const boundaries = steps.map((s) => s.min).concat(
    steps[steps.length - 1].max,
  );
  const labelFormatter = config.labelFormatter ??
    buildAutoFormatter(boundaries, config.format);

  return {
    type: "stepped",
    steps,
    labelFormatter,
    noData: config.noData,
  };
}

function getNiceTicks(
  dataMin: number,
  dataMax: number,
  nTicks: number,
): { min: number; max: number; ticks: number[] } {
  if (dataMin === dataMax) {
    return {
      min: dataMin,
      max: dataMax,
      ticks: [dataMin],
    };
  }

  const range = dataMax - dataMin;
  const rawStep = range / (nTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;

  let niceStep: number;
  if (normalized <= 1) {
    niceStep = 1 * magnitude;
  } else if (normalized <= 2) {
    niceStep = 2 * magnitude;
  } else if (normalized <= 5) {
    niceStep = 5 * magnitude;
  } else {
    niceStep = 10 * magnitude;
  }

  const niceMin = Math.floor(dataMin / niceStep) * niceStep;
  const niceMax = Math.ceil(dataMax / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.5; v += niceStep) {
    ticks.push(v);
  }

  return { min: niceMin, max: niceMax, ticks };
}

function buildAutoFormatter(
  values: number[],
  format?: "number" | "percent",
): (v: number) => string {
  const displayValues = format === "percent"
    ? values.map((v) => v * 100)
    : values;
  const dp = computeDecimalPlaces(displayValues);
  const clampedDp = Math.min(dp, 3) as 0 | 1 | 2 | 3;
  const fmt = getFormatterFunc(format ?? "number", clampedDp);
  return (v: number) => fmt(v);
}

function computeDecimalPlaces(values: number[]): number {
  let maxDp = 0;
  for (const v of values) {
    const s = Math.abs(v).toPrecision(10);
    const dotIndex = s.indexOf(".");
    if (dotIndex === -1) continue;
    const trimmed = s.replace(/0+$/, "");
    const dp = trimmed.length - dotIndex - 1;
    if (dp > maxDp) maxDp = dp;
  }
  return maxDp;
}
