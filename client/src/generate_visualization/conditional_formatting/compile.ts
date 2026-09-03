import {
  buildAutoFormatter,
  type FigureValuesColorFunc,
  type Language,
  type LegendInput,
  type LegendItem,
  resolveAutoScaleLegend,
  thresholdColorFunc,
  type ValueColorElement,
  valuesColorScale,
} from "panther";
import {
  bucketLabels,
  type ConditionalFormatting,
  type DisplayedRule,
  type EffectiveIndicatorFacts,
  type IndicatorFormat,
  legendBucketOrder,
  pickLang,
  thresholdBoundary,
  thresholdBucketIndex,
  type ThresholdsRule,
} from "lib";
import {
  formatRateAuto,
  getIndicatorIdsForCell,
  getIndicatorIdsForChartValue,
  getIndicatorIdsForMapRegion,
} from "../get_style_from_po/_0_common";

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

// The figure-wide value-colour slot. Every CF source compiles to ONE function
// here; the content sites (table cells, bars, map regions) only ever emit
// panther's value-colour sentinel. `scale` and `thresholds` ignore the
// element. `indicator` reads it: the element's headers walk the app's id
// chain to the value's own indicator rule, and a value whose indicator has no
// rule returns undefined — panther's decline, which a table cell or map
// region renders as "none" and a bar as its series colour. Legend sampling
// calls with no element and gets undefined too (the `indicator` legend is
// derived by compileCfToLegend, never sampled).
export function compileCfToValuesColorFunc(
  cf: ConditionalFormatting,
  facts: EffectiveIndicatorFacts,
  effectiveValueProps: string[],
): FigureValuesColorFunc | undefined {
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
        { noDataColor: cf.noDataColor, boundary: thresholdBoundary(cf) },
      );
    case "indicator":
      return (value, _min, _max, element) => {
        if (element === undefined) return undefined;
        const rule = facts.ruleForValue(
          indicatorIdsForElement(effectiveValueProps, element),
        );
        if (rule === undefined) return undefined;
        const i = thresholdBucketIndex(rule, value);
        return i === undefined ? undefined : rule.buckets[i].color;
      };
  }
}

// The three Info shapes are structurally distinct: only a map region has a
// featureId, only a chart value has a series index.
function indicatorIdsForElement(
  effectiveValueProps: string[],
  element: ValueColorElement,
): (string | undefined)[] {
  if ("featureId" in element) {
    return getIndicatorIdsForMapRegion(effectiveValueProps, element);
  }
  if ("i_series" in element) {
    return getIndicatorIdsForChartValue(effectiveValueProps, element);
  }
  return getIndicatorIdsForCell(effectiveValueProps, element);
}

export function compileCfToLegend(
  cf: ConditionalFormatting,
  formatAs: IndicatorFormat,
  facts: EffectiveIndicatorFacts,
  language: Language,
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
    case "thresholds":
      return ruleLegend(cf, formatAs, language);
    case "indicator":
      return indicatorLegend(facts.displayedRules, language);
  }
}

// One rule's bucket list, best bucket first, labels from the buckets and the
// derived wording (in the rule's OWN format) for unlabelled ones.
function ruleLegend(
  rule: ThresholdsRule,
  formatAs: IndicatorFormat,
  language: Language,
): LegendItem[] {
  const labels = bucketLabels(
    rule,
    buildAutoValueFormatter(rule.cutoffs, formatAs),
    language,
  );
  return legendBucketOrder(rule).map((i) => ({
    label: labels[i],
    color: rule.buckets[i].color,
  }));
}

// The `indicator` legend is DERIVED from the displayed indicators' rules,
// never authored on the figure. Unanimous → that rule's list, formatted in
// its owner's format (never the figure's axisFormat, which collapses to
// `number` for a mixed table). Differing → the distinct colour swatches with a
// "varies by indicator" note. No rules → no legend.
function indicatorLegend(
  displayedRules: DisplayedRule[],
  language: Language,
): LegendItem[] | undefined {
  if (displayedRules.length === 0) return undefined;
  if (displayedRules.length === 1) {
    const { rule, formatAs } = displayedRules[0];
    return ruleLegend(rule, formatAs, language);
  }
  const colors = new Map<string, LegendItem["color"]>();
  for (const { rule } of displayedRules) {
    for (const i of legendBucketOrder(rule)) {
      const color = rule.buckets[i].color;
      colors.set(JSON.stringify(color), color);
    }
  }
  const note = pickLang(language, {
    en: "varies by indicator",
    fr: "varie selon l'indicateur",
    pt: "varia consoante o indicador",
  });
  return [...colors.values()].map((color, i) => ({
    label: i === 0 ? note : "",
    color,
  }));
}
