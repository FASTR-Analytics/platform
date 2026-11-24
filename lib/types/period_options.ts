import { z } from "zod";
import { getPeriodTypeFromValue, type PeriodType } from "@timroberton/panther";

export const periodOption = z.enum(["period_id", "quarter_id", "year"]);
export type PeriodOption = z.infer<typeof periodOption>;

// wb-fastr names periods by their DB column (period_id / quarter_id / year);
// panther names them by PeriodType (year-month / year-quarter / year). These two
// functions are the single boundary between the two vocabularies.
export function periodOptionToPeriodType(opt: PeriodOption): PeriodType {
  switch (opt) {
    case "period_id":
      return "year-month";
    case "quarter_id":
      return "year-quarter";
    case "year":
      return "year";
  }
}

export function periodTypeToPeriodOption(pt: PeriodType): PeriodOption {
  switch (pt) {
    case "year-month":
      return "period_id";
    case "year-quarter":
      return "quarter_id";
    case "year":
      return "year";
  }
}

// Self-identifying period format: a stored value carries its own unit (the three
// ranges are disjoint). Panther classifies the magnitude; we name the column.
// Returns undefined for out-of-range/invalid values; never throws.
export function inferPeriodFormatFromValue(
  v: number,
): PeriodOption | undefined {
  const pt = getPeriodTypeFromValue(v);
  return pt === undefined ? undefined : periodTypeToPeriodOption(pt);
}

// Returns the shared period format of a min/max pair: but only when both values
// self-identify AND agree; otherwise undefined. The save-time refine rejects on
// undefined; read-time consumers skip the period filter.
export function inferPeriodFormatFromValuesIfTheSame(
  min: number,
  max: number,
): PeriodOption | undefined {
  const fMin = inferPeriodFormatFromValue(min);
  const fMax = inferPeriodFormatFromValue(max);
  return fMin !== undefined && fMin === fMax ? fMin : undefined;
}
