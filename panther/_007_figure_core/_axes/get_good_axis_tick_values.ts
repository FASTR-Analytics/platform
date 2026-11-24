// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { isUnique, type TickLabelFormatterOption } from "../deps.ts";
import type { ValueRange } from "../types.ts";

// A round increment, 1, 2 or 5 times a power of ten, kept as its mantissa and
// exponent so that a tick is an integer times it, written without the float
// error a running sum of increments gathers.
type RoundIncrement = { mantissa: 1 | 2 | 5; exponent: number };

// Tick values and bounds carry float noise, so a value within a billionth of
// a range or an increment of a tick stands on it, as the zero line reads it.
const NEAR_FRACTION = 1e-9;

// A formatter that never writes distinct labels would step the increment up
// forever, so the steps stop after ten decades.
const MAX_FORMATTER_STEPS = 30;

export function getGoodAxisTickValues(
  maxValue: number,
  minValue: number,
  startingMaxNumberTicks: number,
  formatter?: (v: number) => string,
): number[] {
  assertAxisRange(minValue, maxValue);

  if (hasNoExtent(minValue, maxValue)) {
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
  let arr = getArrayForNTicksAndExpandedRange(nTicks, minValue, maxValue);

  if (formatter) {
    while (nTicks > 2 && isNotUnique(arr, formatter)) {
      nTicks -= 1;
      arr = getArrayForNTicksAndExpandedRange(nTicks, minValue, maxValue);
    }
  }

  return arr;
}

// The second value axis's ticks: as many as the first's, so they stand on the
// first's grid lines, at the smallest round increment whose ticks cover the
// bounds, starting from zero on the first's zero tick wherever that increment
// allows it.
export function getAlignedAxisTickValues(
  firstTickValues: number[],
  valueMin: number,
  valueMax: number,
  formatter?: (v: number) => string,
): number[] {
  assertAxisRange(valueMin, valueMax);
  if (hasNoExtent(valueMin, valueMax)) {
    const widened = widenBoundsOfNoExtent(valueMin, valueMax);
    return getAlignedAxisTickValues(
      firstTickValues,
      widened.valueMin,
      widened.valueMax,
      formatter,
    );
  }

  const nIntervals = Math.max(1, firstTickValues.length - 1);
  const i_zero = indexOfZeroTick(firstTickValues);
  const startFromFloor = (increment: RoundIncrement): number =>
    Math.floor(valueMin / roundIncrementValue(increment) + NEAR_FRACTION);
  const covers = (increment: RoundIncrement, start: number): boolean =>
    start <= valueMin / roundIncrementValue(increment) + NEAR_FRACTION &&
    start + nIntervals >=
      valueMax / roundIncrementValue(increment) - NEAR_FRACTION;
  const smallestCovering = (increment: RoundIncrement): RoundIncrement =>
    covers(increment, startFromFloor(increment))
      ? increment
      : smallestCovering(nextRoundIncrement(increment));
  const ticksAt = (increment: RoundIncrement): number[] => {
    const zeroAlignedStart = i_zero === undefined ? undefined : 0 - i_zero;
    const start =
      zeroAlignedStart !== undefined && covers(increment, zeroAlignedStart)
        ? zeroAlignedStart
        : startFromFloor(increment);
    return Array.from(
      { length: nIntervals + 1 },
      (_, i) => tickValueAt(start + i, increment),
    );
  };
  const alignedTicks = (increment: RoundIncrement, step: number): number[] => {
    const ticks = ticksAt(increment);
    return formatter !== undefined && step < MAX_FORMATTER_STEPS &&
        isNotUnique(ticks, formatter)
      ? alignedTicks(smallestCovering(nextRoundIncrement(increment)), step + 1)
      : ticks;
  };

  return alignedTicks(
    smallestCovering({
      mantissa: 1,
      exponent: Math.floor(Math.log10((valueMax - valueMin) / nIntervals)) - 1,
    }),
    0,
  );
}

// A function tick label formatter is the one whose labels can coincide, so
// both tick value functions check its labels for repeats.
export function formatterForUniquenessCheck(
  tickLabelFormatter: TickLabelFormatterOption,
): ((v: number) => string) | undefined {
  return typeof tickLabelFormatter === "function"
    ? tickLabelFormatter
    : undefined;
}

function assertAxisRange(valueMin: number, valueMax: number): void {
  if (!isFinite(valueMin) || !isFinite(valueMax)) {
    throw new Error(
      `Invalid axis range: valueMin (${valueMin}) or valueMax (${valueMax}) is not finite`,
    );
  }
  if (valueMax < valueMin) {
    throw new Error(
      `Invalid axis range: valueMax (${valueMax}) < valueMin (${valueMin})`,
    );
  }
}

function hasNoExtent(valueMin: number, valueMax: number): boolean {
  return valueMax - valueMin <=
    Math.max(Math.abs(valueMax), Math.abs(valueMin)) * Number.EPSILON * 100;
}

// Bounds of no extent widen as getGoodAxisTickValues widens them, by a tenth
// either side, or to 0 to 1 at zero.
function widenBoundsOfNoExtent(
  valueMin: number,
  valueMax: number,
): ValueRange {
  const a = valueMin === 0 ? 0 : valueMin * 0.9;
  const b = valueMax === 0 ? 1 : valueMax * 1.1;
  return { valueMin: Math.min(a, b), valueMax: Math.max(a, b) };
}

function indexOfZeroTick(tickValues: number[]): number | undefined {
  const near = Math.abs((tickValues.at(-1) ?? 0) - (tickValues.at(0) ?? 0)) *
    NEAR_FRACTION;
  const i_zero = tickValues.findIndex((v) => Math.abs(v) <= near);
  return i_zero === -1 ? undefined : i_zero;
}

function nextRoundIncrement(increment: RoundIncrement): RoundIncrement {
  return increment.mantissa === 1
    ? { mantissa: 2, exponent: increment.exponent }
    : increment.mantissa === 2
    ? { mantissa: 5, exponent: increment.exponent }
    : { mantissa: 1, exponent: increment.exponent + 1 };
}

function roundIncrementValue(increment: RoundIncrement): number {
  return tickValueAt(1, increment);
}

function tickValueAt(index: number, increment: RoundIncrement): number {
  return increment.exponent >= 0
    ? index * increment.mantissa * 10 ** increment.exponent
    : (index * increment.mantissa) / 10 ** -increment.exponent;
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
