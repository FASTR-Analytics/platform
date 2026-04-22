import type {
  ColorKeyOrString,
  ContinuousScaleConfig,
} from "@timroberton/panther";
import { t3 } from "../translate/mod.ts";
import { cfStorageSchema } from "./conditional_formatting_standalone.ts";

export { cfStorageSchema };
export type CfStorage = import("zod").infer<typeof cfStorageSchema>;

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

export type ConditionalFormattingThresholds = {
  type: "thresholds";
  cutoffs: number[];
  buckets: Array<{ color: ColorKeyOrString }>;
  // Semantic direction — drives label inclusivity:
  //   "higher-is-better" (default) → lowest bucket is "< X", highest is "≥ X".
  //   "lower-is-better" → lowest bucket is "≤ X", highest is "> X".
  // Has no effect on symmetric (diverging) cutoffs — those use "within" wording.
  direction?: "higher-is-better" | "lower-is-better";
  noDataColor?: ColorKeyOrString;
};

export type ConditionalFormatting =
  | { type: "none" }
  | ConditionalFormattingScale
  | ConditionalFormattingThresholds;

// ============================================================================
// Bridge: flat storage ↔ union abstraction
// ============================================================================

export function selectCf(s: CfStorage): ConditionalFormatting {
  switch (s.cfMode) {
    case "none":
      return { type: "none" };
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
        buckets: s.cfThresholdBuckets.map((b) => ({ color: b.color as ColorKeyOrString })),
        direction: s.cfThresholdDirection,
        noDataColor: s.cfThresholdNoDataColor || undefined,
      };
  }
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
    cfThresholdBuckets: cf.buckets.map((b) => ({ color: b.color })),
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
// Bucket label derivation — labels aren't stored. The cutoffs drive the
// wording. If cutoffs are symmetric around zero (e.g. [-10, 10] or
// [-20, -10, 10, 20]) labels use diverging wording ("More than X below",
// "Within X", "More than Y above"). Otherwise standard range wording
// ("< X", "X–Y", "≥ X").
//
// Reactive: editors + legend should call this with the current cutoffs at
// display time; any cutoff edit re-derives the labels automatically.
// ============================================================================

export function deriveBucketLabels(
  cutoffs: number[],
  fmt: (v: number) => string,
  direction: "higher-is-better" | "lower-is-better" = "higher-is-better",
): string[] {
  if (isSymmetricAroundZero(cutoffs)) {
    return symmetricBucketLabels(cutoffs, fmt);
  }
  return standardBucketLabels(cutoffs, fmt, direction);
}

function isSymmetricAroundZero(cutoffs: number[]): boolean {
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
  direction: "higher-is-better" | "lower-is-better",
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
): string[] {
  const n = cutoffs.length + 1;
  const middleIdx = Math.floor(n / 2);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    if (i === middleIdx) {
      const mag = fmt(cutoffs[middleIdx]); // smallest positive cutoff
      out.push(t3({ en: `Within ${mag}`, fr: `À ${mag} près` }));
    } else if (i < middleIdx) {
      if (i === 0) {
        const mag = fmt(-cutoffs[0]);
        out.push(
          t3({ en: `More than ${mag} below`, fr: `Plus de ${mag} en dessous` }),
        );
      } else {
        const lo = fmt(-cutoffs[i]);
        const hi = fmt(-cutoffs[i - 1]);
        out.push(
          t3({ en: `${lo} – ${hi} below`, fr: `${lo} – ${hi} en dessous` }),
        );
      }
    } else {
      if (i === n - 1) {
        const mag = fmt(cutoffs[cutoffs.length - 1]);
        out.push(
          t3({ en: `More than ${mag} above`, fr: `Plus de ${mag} au-dessus` }),
        );
      } else {
        const lo = fmt(cutoffs[i - 1]);
        const hi = fmt(cutoffs[i]);
        out.push(
          t3({ en: `${lo} – ${hi} above`, fr: `${lo} – ${hi} au-dessus` }),
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