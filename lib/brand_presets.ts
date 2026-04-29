import type { ColorPreset, ColorPresetId } from "@timroberton/panther";
import { _GFF_GREEN, _NIGERIA_GREEN, _KEY_COLORS } from "./key_colors.ts";

export const BRAND_PRESET_IDS = ["gff", "nigeria"] as const;
export type BrandPresetId = (typeof BRAND_PRESET_IDS)[number];

const SLIDE_BASE_CONTENT = "#393939";

export const BRAND_PRESETS: ColorPreset[] = [
  {
    id: "gff" as ColorPresetId,
    name: "GFF",
    hue: 176,
    swatch: _GFF_GREEN,
    base100: "#ffffff",
    base200: _KEY_COLORS.base200,
    base300: _KEY_COLORS.base300,
    baseContent: SLIDE_BASE_CONTENT,
    baseContentMuted: "#6b6b6b",
    primary: _GFF_GREEN,
    primaryContent: "#ffffff",
    primaryContentMuted: "#a0c4c2",
  },
  {
    id: "nigeria" as ColorPresetId,
    name: "Nigeria",
    hue: 160,
    swatch: _NIGERIA_GREEN,
    base100: "#ffffff",
    base200: _KEY_COLORS.base200,
    base300: _KEY_COLORS.base300,
    baseContent: SLIDE_BASE_CONTENT,
    baseContentMuted: "#6b6b6b",
    primary: _NIGERIA_GREEN,
    primaryContent: "#ffffff",
    primaryContentMuted: "#80c4a8",
  },
];

export const BRAND_PRIMARY_HEX_MAP: Record<string, BrandPresetId> = {
  [_GFF_GREEN.toLowerCase()]: "gff",
  [_NIGERIA_GREEN.toLowerCase()]: "nigeria",
};

export function getBrandPreset(id: BrandPresetId): ColorPreset {
  const preset = BRAND_PRESETS.find((p) => (p.id as string) === id);
  if (!preset) {
    throw new Error(`Unknown brand preset: ${id}`);
  }
  return preset;
}

export function findBrandPresetByHex(hex: string): BrandPresetId | undefined {
  return BRAND_PRIMARY_HEX_MAP[hex.toLowerCase()];
}

export function isBrandPresetId(id: string): id is BrandPresetId {
  return BRAND_PRESET_IDS.includes(id as BrandPresetId);
}
