// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PaletteName } from "./palettes.ts";
import {
  PALETTE_BLACK_TO_WHITE_20,
  PALETTE_DARKBLUE_TO_WHITE_20,
  TIM_COLORS,
} from "./tim_colors.ts";
import type { KeyColors } from "./types.ts";

export type KeyColorThemeName =
  | "panther-default"
  | "dark-blue"
  | "uwa"
  | "neutral-light"
  | "neutral-dark"
  | "warm-light"
  | "warm-dark"
  | "nord-light"
  | "nord-dark"
  | "corporate"
  | "forest"
  | "imnhc-2026";

export type KeyColorThemeCategory = "light" | "dark";

export type KeyColorThemeOption = {
  id: KeyColorThemeName;
  label: string;
  category: KeyColorThemeCategory;
};

type KeyColorTheme = {
  label: string;
  category: KeyColorThemeCategory;
  colors: KeyColors;
};

export const KEY_COLOR_THEMES: Record<KeyColorThemeName, KeyColorTheme> = {
  "panther-default": {
    label: "Panther Default",
    category: "light",
    colors: {
      base100: "#ffffff",
      base200: "#f2f2f2",
      base300: "#cacaca",
      baseContent: "#2a2a2a",
      primary: "#0e706c",
      primaryContent: "#ffffff",
      neutral: "#a1a1a1",
      neutralContent: "#ffffff",
      success: "#009f70",
      successContent: "#ffffff",
      warning: "#d97706",
      warningContent: "#ffffff",
      danger: "#f04d44",
      dangerContent: "#ffffff",
    },
  },
  "dark-blue": {
    label: "Dark Blue",
    category: "light",
    colors: {
      base100: PALETTE_DARKBLUE_TO_WHITE_20[19],
      base200: PALETTE_DARKBLUE_TO_WHITE_20[18],
      base300: PALETTE_DARKBLUE_TO_WHITE_20[17],
      baseContent: TIM_COLORS.DarkBlue,
      primary: "#000C5C",
      primaryContent: TIM_COLORS.White,
      neutral: "#6b7280",
      neutralContent: "#ffffff",
      success: "#059669",
      successContent: "#ffffff",
      warning: "#d97706",
      warningContent: "#ffffff",
      danger: "#dc2626",
      dangerContent: "#ffffff",
    },
  },
  "uwa": {
    label: "UWA",
    category: "light",
    colors: {
      base100: PALETTE_BLACK_TO_WHITE_20[19],
      base200: PALETTE_BLACK_TO_WHITE_20[18],
      base300: PALETTE_BLACK_TO_WHITE_20[17],
      baseContent: TIM_COLORS.Black,
      primary: TIM_COLORS.UWABlue,
      primaryContent: TIM_COLORS.White,
      neutral: "#6b7280",
      neutralContent: "#ffffff",
      success: "#059669",
      successContent: "#ffffff",
      warning: "#d97706",
      warningContent: "#ffffff",
      danger: "#dc2626",
      dangerContent: "#ffffff",
    },
  },
  "neutral-light": {
    label: "Neutral Light",
    category: "light",
    colors: {
      base100: "#ffffff",
      base200: "#f4f4f5",
      base300: "#e4e4e7",
      baseContent: "#18181b",
      primary: "#18181b",
      primaryContent: "#fafafa",
      neutral: "#71717a",
      neutralContent: "#ffffff",
      success: "#16a34a",
      successContent: "#ffffff",
      warning: "#ca8a04",
      warningContent: "#ffffff",
      danger: "#dc2626",
      dangerContent: "#ffffff",
    },
  },
  "neutral-dark": {
    label: "Neutral Dark",
    category: "dark",
    colors: {
      base100: "#18181b",
      base200: "#27272a",
      base300: "#3f3f46",
      baseContent: "#fafafa",
      primary: "#fafafa",
      primaryContent: "#18181b",
      neutral: "#a1a1aa",
      neutralContent: "#18181b",
      success: "#4ade80",
      successContent: "#052e16",
      warning: "#facc15",
      warningContent: "#422006",
      danger: "#f87171",
      dangerContent: "#450a0a",
    },
  },
  "warm-light": {
    label: "Warm Light",
    category: "light",
    colors: {
      base100: "#ffffff",
      base200: "#f5f5f4",
      base300: "#e7e5e4",
      baseContent: "#1c1917",
      primary: "#b45309",
      primaryContent: "#ffffff",
      neutral: "#78716c",
      neutralContent: "#ffffff",
      success: "#059669",
      successContent: "#ffffff",
      warning: "#ca8a04",
      warningContent: "#ffffff",
      danger: "#dc2626",
      dangerContent: "#ffffff",
    },
  },
  "warm-dark": {
    label: "Warm Dark",
    category: "dark",
    colors: {
      base100: "#1c1917",
      base200: "#292524",
      base300: "#44403c",
      baseContent: "#fafaf9",
      primary: "#f59e0b",
      primaryContent: "#1c1917",
      neutral: "#a8a29e",
      neutralContent: "#1c1917",
      success: "#4ade80",
      successContent: "#052e16",
      warning: "#fbbf24",
      warningContent: "#422006",
      danger: "#f87171",
      dangerContent: "#450a0a",
    },
  },
  "nord-light": {
    label: "Nord Light",
    category: "light",
    colors: {
      base100: "#ECEFF4",
      base200: "#E5E9F0",
      base300: "#D8DEE9",
      baseContent: "#2E3440",
      primary: "#5E81AC",
      primaryContent: "#ECEFF4",
      neutral: "#4C566A",
      neutralContent: "#ECEFF4",
      success: "#27ae60",
      successContent: "#ffffff",
      warning: "#d08c0a",
      warningContent: "#ffffff",
      danger: "#bf3b33",
      dangerContent: "#ffffff",
    },
  },
  "nord-dark": {
    label: "Nord Dark",
    category: "dark",
    colors: {
      base100: "#2E3440",
      base200: "#3B4252",
      base300: "#434C5E",
      baseContent: "#ECEFF4",
      primary: "#88C0D0",
      primaryContent: "#2E3440",
      neutral: "#D8DEE9",
      neutralContent: "#2E3440",
      success: "#A3BE8C",
      successContent: "#2E3440",
      warning: "#EBCB8B",
      warningContent: "#2E3440",
      danger: "#BF616A",
      dangerContent: "#ECEFF4",
    },
  },
  "corporate": {
    label: "Corporate",
    category: "light",
    colors: {
      base100: "#ffffff",
      base200: "#f4f4f4",
      base300: "#e0e0e0",
      baseContent: "#161616",
      primary: "#0f62fe",
      primaryContent: "#ffffff",
      neutral: "#6f6f6f",
      neutralContent: "#ffffff",
      success: "#198038",
      successContent: "#ffffff",
      warning: "#f1c21b",
      warningContent: "#161616",
      danger: "#da1e28",
      dangerContent: "#ffffff",
    },
  },
  "forest": {
    label: "Forest",
    category: "light",
    colors: {
      base100: "#f8faf8",
      base200: "#eef2ee",
      base300: "#dce3dc",
      baseContent: "#1a2e1a",
      primary: "#1b7340",
      primaryContent: "#ffffff",
      neutral: "#5a6e5a",
      neutralContent: "#ffffff",
      success: "#15803d",
      successContent: "#ffffff",
      warning: "#ca8a04",
      warningContent: "#ffffff",
      danger: "#dc2626",
      dangerContent: "#ffffff",
    },
  },
  "imnhc-2026": {
    label: "IMNHC 2026",
    category: "light",
    colors: {
      base100: "#ffffff",
      base200: "#f0ecf4",
      base300: "#d5cce2",
      baseContent: "#2d1050",
      primary: "#461E7D",
      primaryContent: "#ffffff",
      neutral: "#6b6b8a",
      neutralContent: "#ffffff",
      success: "#0D6E4F",
      successContent: "#ffffff",
      warning: "#E5A700",
      warningContent: "#2d1050",
      danger: "#CC2229",
      dangerContent: "#ffffff",
    },
  },
};

export const KEY_COLOR_THEME_OPTIONS: KeyColorThemeOption[] = Object.entries(
  KEY_COLOR_THEMES,
).map(([id, t]) => ({
  id: id as KeyColorThemeName,
  label: t.label,
  category: t.category,
}));

export const RECOMMENDED_PALETTES: Record<
  KeyColorThemeName,
  { qualitative: PaletteName; sequential: PaletteName; diverging: PaletteName }
> = {
  "panther-default": {
    qualitative: "tableau10",
    sequential: "bu-gn",
    diverging: "rd-bu",
  },
  "dark-blue": {
    qualitative: "tableau10",
    sequential: "blues",
    diverging: "rd-bu",
  },
  "uwa": {
    qualitative: "tableau10",
    sequential: "pu-bu",
    diverging: "rd-yl-bu",
  },
  "neutral-light": {
    qualitative: "tableau10",
    sequential: "greys",
    diverging: "rd-gy",
  },
  "neutral-dark": {
    qualitative: "tableau10",
    sequential: "greys",
    diverging: "rd-gy",
  },
  "warm-light": {
    qualitative: "set2",
    sequential: "yl-or-br",
    diverging: "rd-yl-gn",
  },
  "warm-dark": {
    qualitative: "set2",
    sequential: "yl-or-br",
    diverging: "rd-yl-gn",
  },
  "nord-light": {
    qualitative: "set2",
    sequential: "bu-gn",
    diverging: "rd-bu",
  },
  "nord-dark": {
    qualitative: "set2",
    sequential: "bu-gn",
    diverging: "rd-bu",
  },
  "corporate": {
    qualitative: "category10",
    sequential: "blues",
    diverging: "rd-bu",
  },
  "forest": {
    qualitative: "dark2",
    sequential: "greens",
    diverging: "rd-yl-gn",
  },
  "imnhc-2026": {
    qualitative: "set2",
    sequential: "purples",
    diverging: "pu-or",
  },
};
