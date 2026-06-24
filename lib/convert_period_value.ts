import type { PeriodOption } from "./types/_metric_installed.ts";

// Re-express a self-identifying period value into `target`'s format. Source
// format is disjoint by digit length: year YYYY (4) / quarter_id YYYYQ (5) /
// period_id YYYYMM (6). `isEnd` anchors open conversions to the end vs start of
// the period. Calendar-agnostic (quarter math is Gregorian) — used by the AI /
// validation period handling.
export function convertPeriodValue(
  value: number,
  target: PeriodOption,
  isEnd: boolean,
): number {
  const digits = String(value).length;

  if (digits <= 4) {
    const year = value;
    if (target === "year") return year;
    if (target === "quarter_id") return year * 10 + (isEnd ? 4 : 1);
    if (target === "period_id") return year * 100 + (isEnd ? 12 : 1);
    throw new Error(`Cannot convert ${value} to ${target} format`);
  }

  if (digits === 5) {
    const year = Math.floor(value / 10);
    const quarter = value % 10;
    if (target === "year") return year;
    if (target === "quarter_id") return value;
    if (target === "period_id") {
      return isEnd ? year * 100 + quarter * 3 : year * 100 + (quarter - 1) * 3 + 1;
    }
    throw new Error(`Cannot convert ${value} to ${target} format`);
  }

  const year = Math.floor(value / 100);
  const month = value % 100;

  if (target === "year") return year;
  if (target === "period_id") return value;
  if (target === "quarter_id") {
    if (month >= 1 && month <= 12) {
      return year * 10 + Math.ceil(month / 3);
    }
    throw new Error(`Cannot convert ${value} to quarter_id format — month value ${month} is out of range 1-12`);
  }

  throw new Error(`Cannot convert ${value} to ${target} format`);
}
