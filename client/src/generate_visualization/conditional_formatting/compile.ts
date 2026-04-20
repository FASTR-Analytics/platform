import {
  getFormatterFunc,
  type LegendItem,
  thresholdColorFunc,
  type ValuesColorFunc,
  valuesColorScale,
} from "panther";
import { type ConditionalFormatting, deriveBucketLabels } from "lib";

export function compileCfToValuesColorFunc(
  cf: ConditionalFormatting,
): ValuesColorFunc | undefined {
  switch (cf.type) {
    case "none":
      return undefined;
    case "scale": {
      const base = valuesColorScale(cf.scale, {
        steps: cf.steps,
        noDataColor: cf.noDataColor,
      });
      if (cf.domain.kind === "auto") return base;
      const { min, max } = cf.domain;
      return (value, _liveMin, _liveMax) => base(value, min, max);
    }
    case "thresholds":
      return thresholdColorFunc(
        cf.cutoffs,
        cf.buckets.map((b) => b.color),
        cf.noDataColor,
      );
  }
}

export function compileCfToLegendItems(
  cf: ConditionalFormatting,
  formatAs: "percent" | "number",
  decimalPlaces: number,
): LegendItem[] | undefined {
  if (cf.type !== "thresholds") return undefined;
  const fmt = getFormatterFunc(formatAs, decimalPlaces);
  const labels = deriveBucketLabels(cf.cutoffs, fmt, cf.direction);
  return cf.buckets.map((bucket, i) => ({
    label: labels[i],
    color: bucket.color,
  }));
}
