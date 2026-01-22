// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { isUnique, type MeasuredText } from "../deps.ts";

export function getGoodAxisTickValues(
  maxValue: number,
  minValue: number,
  startingMaxNumberTicks: number,
  formatter: (v: number) => string,
): number[] {
  if (!isFinite(maxValue) || !isFinite(minValue)) {
    throw new Error(
      `Invalid axis range: maxValue (${maxValue}) or minValue (${minValue}) is not finite`,
    );
  }

  if (maxValue < minValue) {
    throw new Error(
      `Invalid axis range: maxValue (${maxValue}) < minValue (${minValue})`,
    );
  }

  const range = maxValue - minValue;
  const avgMagnitude = Math.max(Math.abs(maxValue), Math.abs(minValue));
  const epsilon = avgMagnitude * Number.EPSILON * 100;

  if (range <= epsilon) {
    const adjustedMax = maxValue === 0 ? 1 : maxValue * 1.1;
    const adjustedMin = minValue === 0 ? 0 : minValue * 0.9;
    return getGoodAxisTickValues(
      adjustedMax,
      adjustedMin,
      startingMaxNumberTicks,
      formatter,
    );
  }

  let nTicks = startingMaxNumberTicks;
  let arr = getArrayForNTicksAndMaxValue(nTicks, minValue, maxValue);

  while (nTicks > 2 && isNotUnique(arr, formatter)) {
    nTicks -= 1;
    arr = getArrayForNTicksAndMaxValue(nTicks, minValue, maxValue);
  }

  return arr;
}

export function getGoodAxisTickValues_V2(
  maxValue: number,
  minValue: number,
  startingMaxNumberTicks: number,
  formatter: (v: number) => string,
): number[] {
  if (!isFinite(maxValue) || !isFinite(minValue)) {
    throw new Error(
      `Invalid axis range: maxValue (${maxValue}) or minValue (${minValue}) is not finite`,
    );
  }

  if (maxValue < minValue) {
    throw new Error(
      `Invalid axis range: maxValue (${maxValue}) < minValue (${minValue})`,
    );
  }

  const range = maxValue - minValue;
  const avgMagnitude = Math.max(Math.abs(maxValue), Math.abs(minValue));
  const epsilon = avgMagnitude * Number.EPSILON * 100;

  if (range <= epsilon) {
    const adjustedMax = maxValue === 0 ? 1 : maxValue * 1.1;
    const adjustedMin = minValue === 0 ? 0 : minValue * 0.9;
    return getGoodAxisTickValues_V2(
      adjustedMax,
      adjustedMin,
      startingMaxNumberTicks,
      formatter,
    );
  }

  let nTicks = startingMaxNumberTicks;
  let arr = getArrayForNTicksAndExpandedRange(nTicks, minValue, maxValue);

  while (nTicks > 2 && isNotUnique(arr, formatter)) {
    nTicks -= 1;
    arr = getArrayForNTicksAndExpandedRange(nTicks, minValue, maxValue);
  }

  return arr;
}

function getArrayForNTicksAndMaxValue(
  nTicks: number,
  minValue: number,
  maxValue: number,
) {
  const increment = (maxValue - minValue) / (nTicks - 1);
  const roundedIncrement = getAppropriatelyRoundedIncrement(increment);
  return new Array(nTicks)
    .fill(0)
    .map((_, i) => minValue + i * roundedIncrement)
    .filter((v) => v < maxValue + roundedIncrement);
}

function getArrayForNTicksAndExpandedRange(
  nTicks: number,
  minValue: number,
  maxValue: number,
) {
  const rawIncrement = (maxValue - minValue) / (nTicks - 1);
  const roundedIncrement = getAppropriatelyRoundedIncrement(rawIncrement);

  if (roundedIncrement === 0 || !isFinite(roundedIncrement)) {
    throw new Error(
      `Invalid roundedIncrement (${roundedIncrement}) for range [${minValue}, ${maxValue}] with ${nTicks} ticks`,
    );
  }

  const roundedMin = Math.floor(minValue / roundedIncrement) * roundedIncrement;
  const roundedMax = Math.ceil(maxValue / roundedIncrement) * roundedIncrement;

  const actualNTicks =
    Math.round((roundedMax - roundedMin) / roundedIncrement) + 1;

  if (!isFinite(actualNTicks) || actualNTicks < 0) {
    throw new Error(
      `Invalid actualNTicks (${actualNTicks}) for range [${roundedMin}, ${roundedMax}] with increment ${roundedIncrement}`,
    );
  }

  return new Array(actualNTicks)
    .fill(0)
    .map((_, i) => roundedMin + i * roundedIncrement);
}

function isNotUnique(arr: number[], formatter: (v: number) => string) {
  return !isUnique(arr.map((v) => formatter(v)));
}

function getAppropriatelyRoundedIncrement(n: number): number {
  if (n <= 0 || !isFinite(n)) {
    throw new Error(`Invalid increment value: ${n}`);
  }

  const tens = Math.ceil(Math.log10(n));
  const denom = Math.pow(10, tens);
  const denom5 = denom / 2;
  const denom2 = denom / 5;

  if (n > denom5) {
    const result = Math.ceil(n / denom) * denom;
    return result > 0 ? result : n;
  }
  if (n > denom2) {
    const result = Math.ceil(n / denom5) * denom5;
    return result > 0 ? result : n;
  }
  const result = Math.ceil(n / denom2) * denom2;
  return result > 0 ? result : n;
}

export function getPropotionOfYAxisTakenUpByTicks(
  yAxisTickLabelDimensions: MeasuredText[],
  gridStrokeWidth: number,
  chartAreaHeight: number,
): number {
  const sumYAxisTickLabelHeights = yAxisTickLabelDimensions.reduce(
    (sum, obj, i, arr) => {
      if (i === 0 || i === arr.length - 1) {
        return sum + gridStrokeWidth + (obj.dims.h() - gridStrokeWidth) / 2;
      }
      return sum + obj.dims.h();
    },
    0,
  );
  return sumYAxisTickLabelHeights / chartAreaHeight;
}
