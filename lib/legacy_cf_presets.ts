import { getAdjustedColor } from "@timroberton/panther";
import type { TranslatableString } from "@timroberton/panther";
import {
  _CF_LIGHTER_GREEN,
  _CF_LIGHTER_RED,
  _CF_LIGHTER_YELLOW,
} from "./key_colors.ts";
import type { ConditionalFormattingThresholds } from "./types/conditional_formatting.ts";

export type LegacyCfPresetId =
  | "fmt-80-70"
  | "fmt-90-80"
  | "fmt-10-20"
  | "fmt-05-10"
  | "fmt-01-03"
  | "fmt-neg10-pos10"
  | "fmt-thresholds-1-2-5"
  | "fmt-thresholds-2-5-10"
  | "fmt-thresholds-5-10-20";

export type LegacyCfPreset = {
  id: LegacyCfPresetId;
  label: TranslatableString;
  value: ConditionalFormattingThresholds;
};

const LEGACY_NO_DATA_COLOR = "#ffffff";

function threeTier(
  c1: number,
  c2: number,
  buckets: [low: string, mid: string, high: string] = [
    _CF_LIGHTER_RED,
    _CF_LIGHTER_YELLOW,
    _CF_LIGHTER_GREEN,
  ],
): ConditionalFormattingThresholds {
  return {
    type: "thresholds",
    cutoffs: [c2, c1],
    buckets: [
      { color: buckets[0] },
      { color: buckets[1] },
      { color: buckets[2] },
    ],
    noDataColor: LEGACY_NO_DATA_COLOR,
  };
}

function reverseThreeTier(
  c1: number,
  c2: number,
): ConditionalFormattingThresholds {
  return {
    type: "thresholds",
    cutoffs: [c1, c2],
    buckets: [
      { color: _CF_LIGHTER_GREEN },
      { color: _CF_LIGHTER_YELLOW },
      { color: _CF_LIGHTER_RED },
    ],
    direction: "lower-is-better",
    noDataColor: LEGACY_NO_DATA_COLOR,
  };
}

// 7-bucket diverging presets. Note: legacy used a mix of `<` and `>` so exact-
// boundary values could land in a neighbouring bucket; panther's
// thresholdColorFunc uses `<` uniformly, so values at a positive cutoff shift
// one bucket versus legacy. Acceptable because cutoffs are round numbers and
// real data rarely hits them exactly.
function divergingSevenBucket(
  small: number,
  mid: number,
  large: number,
): ConditionalFormattingThresholds {
  const darkRed = getAdjustedColor(_CF_LIGHTER_RED, { darken: 0.25 });
  const red = _CF_LIGHTER_RED;
  const brighterRed = getAdjustedColor(_CF_LIGHTER_RED, { brighten: 0.5 });
  const brighterGreen = getAdjustedColor(_CF_LIGHTER_GREEN, { brighten: 0.5 });
  const green = _CF_LIGHTER_GREEN;
  const darkGreen = getAdjustedColor(_CF_LIGHTER_GREEN, { darken: 0.25 });
  return {
    type: "thresholds",
    cutoffs: [-large, -mid, -small, small, mid, large],
    buckets: [
      { color: darkRed },
      { color: red },
      { color: brighterRed },
      { color: { key: "base200" } },
      { color: brighterGreen },
      { color: green },
      { color: darkGreen },
    ],
    noDataColor: LEGACY_NO_DATA_COLOR,
  };
}

export const LEGACY_CF_PRESETS: Record<LegacyCfPresetId, LegacyCfPreset> = {
  "fmt-80-70": {
    id: "fmt-80-70",
    label: { en: "80% / 70% cutoffs", fr: "Seuils 80 % / 70 %" },
    value: threeTier(0.8, 0.7),
  },
  "fmt-90-80": {
    id: "fmt-90-80",
    label: { en: "90% / 80% cutoffs", fr: "Seuils 90 % / 80 %" },
    value: threeTier(0.9, 0.8),
  },
  "fmt-10-20": {
    id: "fmt-10-20",
    label: { en: "10% / 20% cutoffs (reverse)", fr: "Seuils 10 % / 20 % (inverse)" },
    value: reverseThreeTier(0.1, 0.2),
  },
  "fmt-05-10": {
    id: "fmt-05-10",
    label: { en: "5% / 10% cutoffs (reverse)", fr: "Seuils 5 % / 10 % (inverse)" },
    value: reverseThreeTier(0.05, 0.1),
  },
  "fmt-01-03": {
    id: "fmt-01-03",
    label: { en: "1% / 3% cutoffs (reverse)", fr: "Seuils 1 % / 3 % (inverse)" },
    value: reverseThreeTier(0.01, 0.03),
  },
  "fmt-neg10-pos10": {
    id: "fmt-neg10-pos10",
    label: { en: "±10% deviation", fr: "Écart de ±10 %" },
    value: {
      type: "thresholds",
      cutoffs: [-0.1, 0.1],
      buckets: [
        { color: _CF_LIGHTER_RED },
        { color: { key: "base200" } },
        { color: _CF_LIGHTER_GREEN },
      ],
      noDataColor: LEGACY_NO_DATA_COLOR,
    },
  },
  "fmt-thresholds-1-2-5": {
    id: "fmt-thresholds-1-2-5",
    label: { en: "Diverging ±1% / ±2% / ±5%", fr: "Divergent ±1 % / ±2 % / ±5 %" },
    value: divergingSevenBucket(0.01, 0.02, 0.05),
  },
  "fmt-thresholds-2-5-10": {
    id: "fmt-thresholds-2-5-10",
    label: { en: "Diverging ±2% / ±5% / ±10%", fr: "Divergent ±2 % / ±5 % / ±10 %" },
    value: divergingSevenBucket(0.02, 0.05, 0.1),
  },
  "fmt-thresholds-5-10-20": {
    id: "fmt-thresholds-5-10-20",
    label: { en: "Diverging ±5% / ±10% / ±20%", fr: "Divergent ±5 % / ±10 % / ±20 %" },
    value: divergingSevenBucket(0.05, 0.1, 0.2),
  },
};

export const LEGACY_CF_PRESET_IDS: readonly LegacyCfPresetId[] = [
  "fmt-90-80",
  "fmt-80-70",
  "fmt-10-20",
  "fmt-05-10",
  "fmt-01-03",
  "fmt-neg10-pos10",
  "fmt-thresholds-1-2-5",
  "fmt-thresholds-2-5-10",
  "fmt-thresholds-5-10-20",
] as const;
