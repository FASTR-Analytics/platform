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

// Auto-decimal formatter over a known set of values, 3-way. rate_per_10k is
// stored as a bare rate and written as a per-10,000 count, so both the decimal
// choice and the printed label see the scaled magnitude.
export function buildAutoValueFormatter(
  values: number[],
  formatAs: IndicatorFormat,
): (v: number) => string {
  if (formatAs !== "rate_per_10k") {
    return buildAutoFormatter(values, formatAs);
  }
  const auto = buildAutoFormatter(values.map((v) => v * 10000), "number");
  return (v: number) => auto(v * 10000);
}

// Scale legends take EITHER panther's two-way `format` (which builds an
// auto-decimal formatter) or an explicit `labelFormatter` function, which wins.
// rate_per_10k has no `format` value, so it goes through the function escape —
// the same escape the scale axis's tick labels use, which is why the legend and
// the axis cannot drift apart by a factor of 10,000.
//
// `boundaries` must be the RESOLVED tick/step list, not the domain endpoints:
// the auto-decimal choice sizes to the values it is given, and endpoints alone
// under-size intermediate ticks (0..10 needs 0 decimals; its ticks 2.5/7.5
// need 1). Use fixedDomainLegendBoundaries to reproduce panther's fixed-domain
// list.
export function scaleLegendFormat(
  formatAs: IndicatorFormat,
  boundaries: number[],
):
  | { format: "number" | "percent" }
  | { labelFormatter: (v: number) => string } {
  if (formatAs === "rate_per_10k") {
    return { labelFormatter: buildAutoValueFormatter(boundaries, formatAs) };
  }
  return { format: formatAs };
}

// The boundary values panther resolves for a FIXED-domain auto scale legend —
// exact linear interpolation (resolve_auto_scale_legend: stepped uses
// nSteps+1 step edges, gradient uses nTicks=5 evenly spaced ticks) — so a
// labelFormatter built from this list sizes decimals from the same values
// panther will label. Auto (data-fitted) domains resolve inside panther and
// are not reproducible here.
export function fixedDomainLegendBoundaries(
  domain: { min: number; max: number },
  steps: number | undefined,
): number[] {
  const n = steps !== undefined && steps >= 2 ? steps + 1 : 5;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(domain.min + (i / (n - 1)) * (domain.max - domain.min));
  }
  return out;
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
        cf.noDataColor,
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
      const format = scaleLegendFormat(
        formatAs,
        fixedDomainLegendBoundaries(domain, isDiscrete ? cf.steps : undefined),
      );
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

