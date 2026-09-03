import type {
  ColorKeyOrString,
  ContinuousScaleConfig,
  Language,
  ThresholdBoundary,
} from "@timroberton/panther";
import type { ZodType } from "zod";
import { pickLang } from "../translate/t-func.ts";
import {
  cfStorageSchema,
  thresholdsRuleSchema as thresholdsRuleSchemaStandalone,
} from "./conditional_formatting_standalone.ts";

export { cfStorageSchema };
export type CfStorage = import("zod").infer<typeof cfStorageSchema>;

// The standalone schema (vendored, panther-free) types a colour key as a bare
// string; here it is retyped to the ThresholdsRule the app works with.
export const thresholdsRuleSchema =
  thresholdsRuleSchemaStandalone as unknown as ZodType<ThresholdsRule>;

// ============================================================================
// ConditionalFormatting — the reusable abstraction.
// Panther-extractable. Callers work with this nested union; compile functions
// switch on `.type` for type-safe branching.
//
// Storage in wb-fastr is flattened to top-level `cf*` fields on `s` (see
// schemas in presentation_object_config.ts). selectCf/writeCf below bridge
// storage ↔ abstraction. The flat storage is a Solid-reactivity concern; the
// union is the thing that matters semantically.
// ============================================================================

export type ConditionalFormattingScale = {
  type: "scale";
  scale: ContinuousScaleConfig;
  steps?: number;
  domain:
    | { kind: "auto" }
    | { kind: "fixed"; min: number; max: number; mid?: number };
  noDataColor?: ColorKeyOrString;
};

export type ThresholdDirection = "higher-is-better" | "lower-is-better";

export type ThresholdBucket = { color: ColorKeyOrString; label?: string };

// A thresholds rule on its own: cutoffs in STORED units, ascending; one more
// bucket than cutoffs; `label` is plain text, optional (an unlabelled bucket
// prints the derived wording, bucketLabels). This is what a common indicator
// carries (CommonIndicator.thresholds) and what the figure-level source wraps.
//   direction — the semantic direction, which decides the ONE boundary rule
//   (thresholdBucketIndex) and the label inclusivity:
//     "higher-is-better" (default) → lowest bucket is "< X", highest is "≥ X".
//     "lower-is-better" → lowest bucket is "≤ X", highest is "> X".
//   Ignored for symmetric (diverging) cutoffs — those use "within" wording.
export type ThresholdsRule = {
  cutoffs: number[];
  buckets: ThresholdBucket[];
  direction?: ThresholdDirection;
  noDataColor?: ColorKeyOrString;
};

export type ConditionalFormattingThresholds = {
  type: "thresholds";
} & ThresholdsRule;

// "Each value's colour and legend come from its own indicator's rule": the
// rule is a catalog fact (IndicatorMetadata.thresholds), resolved per value
// through EffectiveIndicatorFacts.ruleForValue. Nothing else is stored.
export type ConditionalFormattingIndicator = { type: "indicator" };

export type ConditionalFormatting =
  | { type: "none" }
  | ConditionalFormattingScale
  | ConditionalFormattingThresholds
  | ConditionalFormattingIndicator;

// ============================================================================
// Bridge: flat storage ↔ union abstraction
// ============================================================================

export function selectCf(s: CfStorage): ConditionalFormatting {
  switch (s.cfMode) {
    case "none":
      return { type: "none" };
    case "indicator":
      return { type: "indicator" };
    case "scale":
      return {
        type: "scale",
        scale: buildContinuousScaleConfig(s),
        steps: s.cfScaleSteps >= 2 ? s.cfScaleSteps : undefined,
        domain:
          s.cfScaleDomainKind === "fixed"
            ? { kind: "fixed", min: s.cfScaleDomainMin, max: s.cfScaleDomainMax }
            : { kind: "auto" },
        noDataColor: s.cfScaleNoDataColor || undefined,
      };
    case "thresholds":
      return {
        type: "thresholds",
        cutoffs: s.cfThresholdCutoffs,
        buckets: s.cfThresholdBuckets.map(storedBucketToBucket),
        direction: s.cfThresholdDirection,
        noDataColor: s.cfThresholdNoDataColor || undefined,
      };
  }
}

function storedBucketToBucket(
  b: CfStorage["cfThresholdBuckets"][number],
): ThresholdBucket {
  return b.label === undefined
    ? { color: b.color as ColorKeyOrString }
    : { color: b.color as ColorKeyOrString, label: b.label };
}

function buildContinuousScaleConfig(s: CfStorage): ContinuousScaleConfig {
  if (s.cfScalePaletteKind === "preset") {
    return { palette: s.cfScalePalettePreset as never, reverse: s.cfScaleReverse };
  }
  if (s.cfScaleCustomMid) {
    return {
      min: s.cfScaleCustomFrom,
      mid: s.cfScaleCustomMid,
      max: s.cfScaleCustomTo,
      reverse: s.cfScaleReverse,
    };
  }
  return {
    min: s.cfScaleCustomFrom,
    max: s.cfScaleCustomTo,
    reverse: s.cfScaleReverse,
  };
}

// Pure projection: nested union → flat storage record. Used by the adapter
// (to produce a plain JS object) and by writeCf (to drive Solid store
// writes). Always returns a complete CfStorage — callers can merge it into
// their target.
export function flattenCf(cf: ConditionalFormatting): CfStorage {
  const base: CfStorage = { ...CF_STORAGE_DEFAULTS };
  if (cf.type === "none") {
    return base;
  }
  if (cf.type === "indicator") {
    return { ...base, cfMode: "indicator" };
  }
  if (cf.type === "scale") {
    const scaleState = parseContinuousScaleConfigForStorage(cf.scale);
    return {
      ...base,
      cfMode: "scale",
      cfScalePaletteKind: scaleState.kind,
      cfScalePalettePreset: scaleState.preset,
      cfScaleCustomFrom: scaleState.from,
      cfScaleCustomMid: scaleState.mid,
      cfScaleCustomTo: scaleState.to,
      cfScaleReverse: scaleState.reverse,
      cfScaleSteps: cf.steps ?? 0,
      cfScaleDomainKind: cf.domain.kind,
      cfScaleDomainMin: cf.domain.kind === "fixed" ? cf.domain.min : base.cfScaleDomainMin,
      cfScaleDomainMax: cf.domain.kind === "fixed" ? cf.domain.max : base.cfScaleDomainMax,
      cfScaleNoDataColor:
        typeof cf.noDataColor === "string"
          ? cf.noDataColor
          : base.cfScaleNoDataColor,
    };
  }
  return {
    ...base,
    cfMode: "thresholds",
    cfThresholdCutoffs: cf.cutoffs,
    cfThresholdBuckets: cf.buckets.map((b) =>
      b.label === undefined ? { color: b.color } : { color: b.color, label: b.label }
    ),
    cfThresholdDirection: cf.direction ?? "higher-is-better",
    cfThresholdNoDataColor:
      typeof cf.noDataColor === "string"
        ? cf.noDataColor
        : base.cfThresholdNoDataColor,
  };
}


function parseContinuousScaleConfigForStorage(scale: ContinuousScaleConfig): {
  kind: "preset" | "custom";
  preset: string;
  from: string;
  mid: string;
  to: string;
  reverse: boolean;
} {
  const empty = { from: "", mid: "", to: "", preset: "" };
  if (typeof scale === "string") {
    if (scale.endsWith(":rev")) {
      return { ...empty, kind: "preset", preset: scale.slice(0, -4), reverse: true };
    }
    return { ...empty, kind: "preset", preset: scale, reverse: false };
  }
  if (Array.isArray(scale)) {
    return {
      ...empty,
      kind: "custom",
      from: stringifyColor(scale[0] ?? ""),
      to: stringifyColor(scale[scale.length - 1] ?? ""),
      reverse: false,
    };
  }
  if ("palette" in scale) {
    return {
      ...empty,
      kind: "preset",
      preset: scale.palette,
      reverse: scale.reverse ?? false,
    };
  }
  if ("mid" in scale) {
    return {
      ...empty,
      kind: "custom",
      from: stringifyColor(scale.min),
      mid: stringifyColor(scale.mid),
      to: stringifyColor(scale.max),
      reverse: scale.reverse ?? false,
    };
  }
  return {
    ...empty,
    kind: "custom",
    from: stringifyColor(scale.min),
    to: stringifyColor(scale.max),
    reverse: scale.reverse ?? false,
  };
}

function stringifyColor(c: ColorKeyOrString): string {
  return typeof c === "string" ? c : "";
}

// ============================================================================
// THE boundary rule — one for colour, label, legend, AI text and harness.
//
// The boundary belongs to the BETTER side. higher-is-better: a value BELOW a
// cutoff (strict `<`) falls in the bucket under it, so an exact cutoff goes
// up. lower-is-better: a value AT OR BELOW a cutoff (`<=`) falls in the bucket
// under it, so an exact cutoff goes down. A rule whose cutoffs are symmetric
// around zero (diverging) has no better side: direction is ignored and the
// boundary is "up", which is what its "within" wording already says.
// ============================================================================

export function thresholdBoundary(rule: ThresholdsRule): ThresholdBoundary {
  if (isSymmetricAroundZero(rule.cutoffs)) return "up";
  return rule.direction === "lower-is-better" ? "down" : "up";
}

export function thresholdBucketIndex(
  rule: ThresholdsRule,
  value: number | undefined,
): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  const inclusive = thresholdBoundary(rule) === "down";
  for (let i = 0; i < rule.cutoffs.length; i++) {
    if (inclusive ? value <= rule.cutoffs[i] : value < rule.cutoffs[i]) {
      return i;
    }
  }
  return rule.cutoffs.length;
}

// Legend order: best bucket first. higher-is-better (and diverging) lists the
// highest bucket first; lower-is-better lists the lowest first.
export function legendBucketOrder(rule: ThresholdsRule): number[] {
  const indices = rule.buckets.map((_, i) => i);
  return thresholdBoundary(rule) === "down" ? indices : indices.reverse();
}

// The label each bucket prints: authored text where the bucket has it, the
// derived wording otherwise.
export function bucketLabels(
  rule: ThresholdsRule,
  fmt: (v: number) => string,
  language: Language,
): string[] {
  const derived = deriveBucketLabels(
    rule.cutoffs,
    fmt,
    language,
    rule.direction ?? "higher-is-better",
  );
  return rule.buckets.map((b, i) => b.label ?? derived[i]);
}

// ============================================================================
// Bucket label derivation — the cutoffs drive the wording. If cutoffs are
// symmetric around zero (e.g. [-10, 10] or [-20, -10, 10, 20]) labels use
// diverging wording ("More than X below", "Within X", "More than Y above").
// Otherwise standard range wording ("< X", "X–Y", "≥ X"), with the operators
// honouring the boundary rule above.
//
// Reactive: editors + legend should call this with the current cutoffs at
// display time; any cutoff edit re-derives the labels automatically.
// ============================================================================

export function deriveBucketLabels(
  cutoffs: number[],
  fmt: (v: number) => string,
  language: Language,
  direction: ThresholdDirection,
): string[] {
  if (isSymmetricAroundZero(cutoffs)) {
    return symmetricBucketLabels(cutoffs, fmt, language);
  }
  return standardBucketLabels(cutoffs, fmt, direction);
}

export function isSymmetricAroundZero(cutoffs: number[]): boolean {
  // Need at least one pair and an even count (so there's a middle bucket
  // straddling zero — n buckets = n-1 cutoffs, odd n → even cutoffs).
  if (cutoffs.length < 2 || cutoffs.length % 2 !== 0) return false;
  const half = cutoffs.length / 2;
  for (let i = 0; i < half; i++) {
    // Pairs sum to zero
    if (cutoffs[i] + cutoffs[cutoffs.length - 1 - i] !== 0) return false;
    // Lower half must all be negative (so "below" is meaningful)
    if (cutoffs[i] >= 0) return false;
  }
  return true;
}

function standardBucketLabels(
  cutoffs: number[],
  fmt: (v: number) => string,
  direction: ThresholdDirection,
): string[] {
  const n = cutoffs.length + 1;
  const out: string[] = [];
  // higher-is-better: lowest bucket is exclusive "<", highest is inclusive "≥".
  // lower-is-better:  lowest bucket is inclusive "≤", highest is exclusive ">".
  const lowOp = direction === "lower-is-better" ? "≤" : "<";
  const highOp = direction === "lower-is-better" ? ">" : "≥";
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      out.push(`${lowOp} ${fmt(cutoffs[0])}`);
    } else if (i === n - 1) {
      out.push(`${highOp} ${fmt(cutoffs[cutoffs.length - 1])}`);
    } else {
      out.push(`${fmt(cutoffs[i - 1])} – ${fmt(cutoffs[i])}`);
    }
  }
  return out;
}

function symmetricBucketLabels(
  cutoffs: number[],
  fmt: (v: number) => string,
  language: Language,
): string[] {
  const n = cutoffs.length + 1;
  const middleIdx = Math.floor(n / 2);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i === middleIdx) {
      const mag = fmt(cutoffs[middleIdx]); // smallest positive cutoff
      out.push(pickLang(language, { en: `Within ${mag}`, fr: `À ${mag} près`, pt: `Dentro de ${mag}` }));
    } else if (i < middleIdx) {
      if (i === 0) {
        const mag = fmt(-cutoffs[0]);
        out.push(
          pickLang(language, { en: `More than ${mag} below`, fr: `Plus de ${mag} en dessous`, pt: `Mais de ${mag} abaixo` }),
        );
      } else {
        const lo = fmt(-cutoffs[i]);
        const hi = fmt(-cutoffs[i - 1]);
        out.push(
          pickLang(language, { en: `${lo} – ${hi} below`, fr: `${lo} – ${hi} en dessous`, pt: `${lo} – ${hi} abaixo` }),
        );
      }
    } else {
      if (i === n - 1) {
        const mag = fmt(cutoffs[cutoffs.length - 1]);
        out.push(
          pickLang(language, { en: `More than ${mag} above`, fr: `Plus de ${mag} au-dessus`, pt: `Mais de ${mag} acima` }),
        );
      } else {
        const lo = fmt(cutoffs[i - 1]);
        const hi = fmt(cutoffs[i]);
        out.push(
          pickLang(language, { en: `${lo} – ${hi} above`, fr: `${lo} – ${hi} au-dessus`, pt: `${lo} – ${hi} acima` }),
        );
      }
    }
  }
  return out;
}

// Sensible defaults used by DEFAULT_S_CONFIG + the adapter when seeding
// new/legacy rows.
export const CF_STORAGE_DEFAULTS: CfStorage = {
  cfMode: "none",
  cfScalePaletteKind: "preset",
  cfScalePalettePreset: "rd-yl-gn",
  cfScaleCustomFrom: "#fee0d2",
  cfScaleCustomMid: "",
  cfScaleCustomTo: "#de2d26",
  cfScaleReverse: false,
  cfScaleSteps: 0,
  cfScaleDomainKind: "auto",
  cfScaleDomainMin: 0,
  cfScaleDomainMax: 1,
  cfScaleNoDataColor: "#f0f0f0",
  cfThresholdCutoffs: [],
  cfThresholdBuckets: [],
  cfThresholdDirection: "higher-is-better",
  cfThresholdNoDataColor: "#ffffff",
};
