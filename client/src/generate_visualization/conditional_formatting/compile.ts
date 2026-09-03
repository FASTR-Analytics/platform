import {
  buildAutoFormatter,
  type LegendInput,
  type LegendItem,
  resolveAutoScaleLegend,
  thresholdColorFunc,
  type ValuesColorFunc,
  valuesColorScale,
} from "panther";
import {
  type ConditionalFormatting,
  deriveBucketLabels,
  type IndicatorFormat,
} from "lib";
import { formatRateAuto } from "../get_style_from_po/_0_common";

// Auto-decimal formatter over a known set of values, 3-way. percent/number
// size their decimals from the list (the fewest that keep it distinct);
// rate_per_10k does NOT — it follows formatRateAuto, the same per-value exact
// rule the scale axis uses, so a cutoff of 0.25 per 10k reads "0.25" in the
// legend and "0.25" on the axis instead of being rounded to "0.3" by a
// list-wide count.
export function buildAutoValueFormatter(
  values: number[],
  formatAs: IndicatorFormat,
): (v: number) => string {
  if (formatAs !== "rate_per_10k") {
    return buildAutoFormatter(values, formatAs);
  }
  return formatRateAuto;
}

// Scale legends take EITHER panther's two-way `format` (which builds an
// auto-decimal formatter) or an explicit `labelFormatter` function, which wins.
// rate_per_10k has no `format` value, so it goes through the function escape —
// the same escape the scale axis's tick labels use, which is why the legend and
// the axis cannot drift apart by a factor of 10,000 OR by a decimal.
//
// It takes no boundary list because formatRateAuto needs none: a boundary list
// was only ever there to size a shared decimal count, and a legend whose domain
// is `auto` (the DEFAULT) has no boundaries to give — the [0, 1] stand-in it
// used to get collapsed every rate tick to zero decimals, so 0 / 0.5 / 1 / 1.5
// per 10k all labelled as "0", "1", "1", "2".
export function scaleLegendFormat(
  formatAs: IndicatorFormat,
):
  | { format: "number" | "percent" }
  | { labelFormatter: (v: number) => string } {
  if (formatAs === "rate_per_10k") {
    return { labelFormatter: formatRateAuto };
  }
  return { format: formatAs };
}

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
        { noDataColor: cf.noDataColor },
      );
  }
}

export function compileCfToLegend(
  cf: ConditionalFormatting,
  formatAs: IndicatorFormat,
): LegendInput | undefined {
  switch (cf.type) {
    case "none":
      return undefined;
    case "scale": {
      if (cf.domain.kind !== "fixed") return undefined;
      const domain = cf.domain;

      const colorFunc = valuesColorScale(cf.scale, {
        steps: cf.steps,
        noDataColor: cf.noDataColor,
      });

      const isDiscrete = (cf.steps ?? 0) >= 2;
      const format = scaleLegendFormat(formatAs);
      const autoConfig = isDiscrete
        ? {
            type: "stepped-auto" as const,
            nSteps: cf.steps!,
            domain,
            ...format,
          }
        : {
            type: "gradient-auto" as const,
            domain,
            ...format,
          };

      return resolveAutoScaleLegend(autoConfig, colorFunc, domain);
    }
    case "thresholds": {
      const fmt = buildAutoValueFormatter(cf.cutoffs, formatAs);
      const labels = deriveBucketLabels(cf.cutoffs, fmt, cf.direction);
      return cf.buckets
        .map((bucket, i) => ({
          label: labels[i],
          color: bucket.color,
        }))
        .reverse();
    }
  }
}

