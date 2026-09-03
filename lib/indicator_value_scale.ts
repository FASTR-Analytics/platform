import type { IndicatorFormat } from "./types/indicators.ts";

// THE displayed magnitude of a stored value, and its inverse. Percent values
// are stored as fractions and rates as bare rates, but everything a reader
// sees — and every threshold a user types — is in the scaled units. Panther's
// percent formatter applies the ×100 itself; it has no per-10,000 format at
// all, which is why the rate scaling lives on this side. One pair for both
// conventions, used by the renderer, the editors and the AI text.
//
// Rounded to 6 decimals on the way up: scaling a stored fraction accumulates
// float error (0.0003 × 10000 → 2.9999999999999996) that an input box would
// otherwise display verbatim in the field the user just typed "3" into.
export function scaleValueForFormat(
  value: number,
  formatAs: IndicatorFormat,
): number {
  const factor = scaleFactor(formatAs);
  return factor === 1 ? value : Math.round(value * factor * 1e6) / 1e6;
}

export function unscaleValueForFormat(
  value: number,
  formatAs: IndicatorFormat,
): number {
  return value / scaleFactor(formatAs);
}

function scaleFactor(formatAs: IndicatorFormat): number {
  if (formatAs === "percent") return 100;
  if (formatAs === "rate_per_10k") return 10000;
  return 1;
}
