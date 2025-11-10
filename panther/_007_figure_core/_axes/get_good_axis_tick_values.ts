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
  if (maxValue === 0 && minValue === 0) {
    return getGoodAxisTickValues(1, 0, startingMaxNumberTicks, formatter);
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
  if (maxValue === 0 && minValue === 0) {
    return getGoodAxisTickValues_V2(1, 0, startingMaxNumberTicks, formatter);
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

  const roundedMin = Math.floor(minValue / roundedIncrement) * roundedIncrement;
  const roundedMax = Math.ceil(maxValue / roundedIncrement) * roundedIncrement;

  const actualNTicks =
    Math.round((roundedMax - roundedMin) / roundedIncrement) + 1;

  return new Array(actualNTicks)
    .fill(0)
    .map((_, i) => roundedMin + i * roundedIncrement);
}

function isNotUnique(arr: number[], formatter: (v: number) => string) {
  return !isUnique(arr.map((v) => formatter(v)));
}

function getAppropriatelyRoundedIncrement(n: number): number {
  const tens = Math.ceil(Math.log10(n));
  const denom = Math.pow(10, tens);
  const denom5 = denom / 2;
  if (n > denom5) {
    return Math.ceil(n / denom) * denom;
  }
  const denom2 = denom / 5;
  if (n > denom2) {
    return Math.ceil(n / denom5) * denom5;
  }
  return Math.ceil(n / denom2) * denom2;
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
