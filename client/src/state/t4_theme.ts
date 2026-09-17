import { createSignal } from "solid-js";
import {
  generateKeyColorsFromPrimary,
  KEY_COLOR_THEMES,
  type KeyColors,
} from "panther";

// Reskin prototype: a per-device look applied as inline custom properties on
// <html>, which beat every stylesheet rule. The default theme sets nothing, so
// the app renders exactly as app.css and panther's _fixed.css declare it.
// Canvas figures keep their fixed key colors; only the HTML UI follows.

export const THEME_PALETTES = [
  "fastr",
  "neutral",
  "warm",
  "nord",
  "corporate",
  "forest",
] as const;
export type ThemePalette = (typeof THEME_PALETTES)[number];

export const THEME_RADII = [0, 2, 4, 8, 12] as const;
export type ThemeRadius = (typeof THEME_RADII)[number];

export const THEME_DENSITIES = ["compact", "default", "comfortable"] as const;
export type ThemeDensity = (typeof THEME_DENSITIES)[number];

export const THEME_TEXT_SCALES = ["small", "default", "large"] as const;
export type ThemeTextScale = (typeof THEME_TEXT_SCALES)[number];

export type Theme = {
  palette: ThemePalette;
  radius: ThemeRadius;
  density: ThemeDensity;
  textScale: ThemeTextScale;
};

export const DEFAULT_THEME: Theme = {
  palette: "fastr",
  radius: 4,
  density: "default",
  textScale: "default",
};

// Panther's paired themes supply both halves; the light-only ones get a dark
// half derived from their primary. "fastr" is the kit default and sets no
// color vars at all.
type PalettePair = { light: KeyColors; dark: KeyColors };
const PALETTE_PAIRS: Record<Exclude<ThemePalette, "fastr">, PalettePair> = {
  neutral: {
    light: KEY_COLOR_THEMES["neutral-light"].colors,
    dark: KEY_COLOR_THEMES["neutral-dark"].colors,
  },
  warm: {
    light: KEY_COLOR_THEMES["warm-light"].colors,
    dark: KEY_COLOR_THEMES["warm-dark"].colors,
  },
  nord: {
    light: KEY_COLOR_THEMES["nord-light"].colors,
    dark: KEY_COLOR_THEMES["nord-dark"].colors,
  },
  corporate: {
    light: KEY_COLOR_THEMES.corporate.colors,
    dark: generateKeyColorsFromPrimary(
      KEY_COLOR_THEMES.corporate.colors.primary,
      "dark",
    ),
  },
  forest: {
    light: KEY_COLOR_THEMES.forest.colors,
    dark: generateKeyColorsFromPrimary(
      KEY_COLOR_THEMES.forest.colors.primary,
      "dark",
    ),
  },
};

const COLOR_TOKENS: [keyof KeyColors, string][] = [
  ["base100", "base-100"],
  ["base200", "base-200"],
  ["base300", "base-300"],
  ["baseContent", "base-content"],
  ["primary", "primary"],
  ["primaryContent", "primary-content"],
  ["neutral", "neutral"],
  ["neutralContent", "neutral-content"],
  ["success", "success"],
  ["successContent", "success-content"],
  ["warning", "warning"],
  ["warningContent", "warning-content"],
  ["danger", "danger"],
  ["dangerContent", "danger-content"],
];

// Base values in rem, mirroring _fixed.css (and app.css for --text-5xl). A
// factor of 1 sets nothing, so the kit's own defaults always win at default;
// these tables only matter when the kit's values move and a scaled step
// should move with them.
const DENSITY_BASE_REM: Record<string, number> = {
  "--ui-pad-sm-x": 0.5,
  "--ui-pad-sm-y": 0.5,
  "--ui-pad-x": 1,
  "--ui-pad-y": 1,
  "--ui-pad-lg-x": 2,
  "--ui-pad-lg-y": 1.5,
  "--ui-gap-sm": 0.5,
  "--ui-gap": 1,
  "--ui-gap-lg": 1.5,
  "--ui-spy-sm": 0.5,
  "--ui-spy": 1.5,
  "--ui-spy-lg": 2,
  "--ui-form-pad-x": 0.75,
  "--ui-form-pad-y": 0.5,
  "--ui-form-pad-sm-x": 0.5,
  "--ui-form-pad-sm-y": 0.25,
};
const DENSITY_FACTOR: Record<ThemeDensity, number> = {
  compact: 0.75,
  default: 1,
  comfortable: 1.25,
};

const TEXT_BASE_REM: Record<string, number> = {
  "--text-xs": 0.75,
  "--text-sm": 0.875,
  "--text-base": 1,
  "--text-lg": 1.125,
  "--text-xl": 1.25,
  "--text-2xl": 1.5,
  "--text-3xl": 1.875,
  "--text-5xl": 3,
};
const TEXT_FACTOR: Record<ThemeTextScale, number> = {
  small: 0.9,
  default: 1,
  large: 1.1,
};

type ThemeVars = Record<string, string | null>;

function scaledRem(
  vars: ThemeVars,
  base: Record<string, number>,
  factor: number,
) {
  for (const [name, rem] of Object.entries(base)) {
    vars[name] =
      factor === 1 ? null : `${Number((rem * factor).toFixed(4))}rem`;
  }
}

function themeVars(t: Theme): ThemeVars {
  const vars: ThemeVars = {};
  const pair = t.palette === "fastr" ? null : PALETTE_PAIRS[t.palette];
  for (const [key, token] of COLOR_TOKENS) {
    vars[`--color-${token}`] = pair
      ? `light-dark(${pair.light[key]}, ${pair.dark[key]})`
      : null;
  }
  // The TS palettes carry no border; base300 is the parity test's mapping.
  vars["--color-border"] = pair
    ? `light-dark(${pair.light.base300}, ${pair.dark.base300})`
    : null;
  vars["--radius"] = t.radius === DEFAULT_THEME.radius ? null : `${t.radius}px`;
  scaledRem(vars, DENSITY_BASE_REM, DENSITY_FACTOR[t.density]);
  scaledRem(vars, TEXT_BASE_REM, TEXT_FACTOR[t.textScale]);
  return vars;
}

function applyTheme(t: Theme) {
  const style = document.documentElement.style;
  for (const [name, value] of Object.entries(themeVars(t))) {
    if (value === null) {
      style.removeProperty(name);
    } else {
      style.setProperty(name, value);
    }
  }
}

const STORAGE_KEY = "theme";

function pick<T>(allowed: readonly T[], v: unknown, fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

// Validated on read, unlike the other T4 prefs: these values feed CSS, and a
// stale or hand-edited value would apply as a bad declaration.
function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const v = JSON.parse(raw) as Partial<Record<keyof Theme, unknown>>;
    return {
      palette: pick(THEME_PALETTES, v.palette, DEFAULT_THEME.palette),
      radius: pick(THEME_RADII, v.radius, DEFAULT_THEME.radius),
      density: pick(THEME_DENSITIES, v.density, DEFAULT_THEME.density),
      textScale: pick(THEME_TEXT_SCALES, v.textScale, DEFAULT_THEME.textScale),
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export const [theme, setThemeInternal] = createSignal<Theme>(readStoredTheme());

export function setTheme(next: Theme) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  setThemeInternal(next);
  applyTheme(next);
}

// Applied at module scope so the stored theme is on <html> before first paint
applyTheme(theme());
