// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color } from "./deps.ts";

export const COLOR_PRESET_IDS = [
  "red",
  "rose",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "purple",
  "warm",
  "gray",
  "slate",
] as const;

export type ColorPresetId = (typeof COLOR_PRESET_IDS)[number];

export type ColorPreset = {
  id: ColorPresetId;
  name: string;
  hue: number;
  swatch: string;
  base100: string;
  base200: string;
  base300: string;
  baseContent: string;
  baseContentMuted: string;
  primary: string;
  primaryContent: string;
  primaryContentMuted: string;
};

function hsl(h: number, s: number, l: number): string {
  return new Color(Color.hslToRgb({ h, s, l })).css();
}

function createPreset(
  id: ColorPresetId,
  name: string,
  hue: number,
  colors: [string, string, string, string],
): ColorPreset {
  return {
    id,
    name,
    hue,
    swatch: hsl(hue, 45, 45),
    base100: "#ffffff",
    base200: colors[0],
    base300: colors[1],
    baseContent: colors[3],
    baseContentMuted: hsl(hue, 10, 45),
    primary: colors[2],
    primaryContent: "#ffffff",
    primaryContentMuted: hsl(hue, 15, 75),
  };
}

export const COLOR_PRESETS: Record<ColorPresetId, ColorPreset> = {
  gray: {
    ...createPreset("gray", "Gray", 220, [
      "#eef1f5",
      "#dde3eb",
      "#2d3444",
      "#1f2530",
    ]),
    swatch: "#2d3444",
  },
  warm: createPreset("warm", "Warm", 35, [
    "#f5f3ef",
    "#ebe6dd",
    "#44392d",
    "#302820",
  ]),
  slate: {
    ...createPreset("slate", "Slate", 210, [
      "#edf2f7",
      "#dce5f0",
      "#2c3a4d",
      "#1e2836",
    ]),
    swatch: "#2c3a4d",
  },
  rose: createPreset("rose", "Rose", 350, [
    "#f7eef1",
    "#f0dde3",
    "#4d2c36",
    "#361e25",
  ]),
  red: createPreset("red", "Red", 5, [
    "#f7efee",
    "#f0dfdc",
    "#4d2f2c",
    "#36201e",
  ]),
  orange: createPreset("orange", "Orange", 25, [
    "#f7f1ee",
    "#f0e3dc",
    "#4d382c",
    "#36271e",
  ]),
  amber: createPreset("amber", "Amber", 40, [
    "#f7f4ee",
    "#f0e8dc",
    "#4d422c",
    "#362f1e",
  ]),
  yellow: createPreset("yellow", "Yellow", 50, [
    "#f6f5ed",
    "#edead9",
    "#4a4728",
    "#33321c",
  ]),
  lime: createPreset("lime", "Lime", 85, [
    "#f2f6ed",
    "#e4edd9",
    "#3d4a28",
    "#2a331c",
  ]),
  green: createPreset("green", "Green", 145, [
    "#edf6f0",
    "#d9eddf",
    "#284a32",
    "#1c3323",
  ]),
  teal: createPreset("teal", "Teal", 175, [
    "#edf5f4",
    "#d9ede9",
    "#284a45",
    "#1c3330",
  ]),
  cyan: createPreset("cyan", "Cyan", 195, [
    "#edf4f6",
    "#d9eaed",
    "#28444a",
    "#1c3033",
  ]),
  blue: createPreset("blue", "Blue", 220, [
    "#eef1f7",
    "#dce4f0",
    "#2c384d",
    "#1e2636",
  ]),
  indigo: createPreset("indigo", "Indigo", 245, [
    "#f0eff7",
    "#e0ddf0",
    "#322c4d",
    "#231e36",
  ]),
  violet: createPreset("violet", "Violet", 270, [
    "#f2eff7",
    "#e5ddf0",
    "#3c2c4d",
    "#291e36",
  ]),
  purple: createPreset("purple", "Purple", 290, [
    "#f5eff7",
    "#eaddf0",
    "#452c4d",
    "#301e36",
  ]),
};

export function getColorPreset(id: ColorPresetId): ColorPreset {
  return COLOR_PRESETS[id];
}

export function getColorPresets(): ColorPreset[] {
  return COLOR_PRESET_IDS.map((id) => COLOR_PRESETS[id]);
}
