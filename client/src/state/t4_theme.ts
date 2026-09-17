import { createSignal } from "solid-js";

// Reskin prototype: a per-device look applied as inline custom properties on
// <html>, which beat every stylesheet rule. Every knob is a short gradient of
// sensible values, not a catalogue of contrasts: colors are light-dark() pairs
// drawn only from the GFF brand guidelines (ENG_Branding
// Guidelines_Secretariat.pdf); rounding, density and text scale write nothing
// at their default step, so those stay what _fixed.css declares. Canvas
// figures keep their fixed key colors; only the HTML UI follows.

export const THEME_RAMPS = ["neutral", "tone", "cool"] as const;
export type ThemeRamp = (typeof THEME_RAMPS)[number];

export const THEME_PRIMARIES = [
  "current",
  "deep-green",
  "logo-green",
  "blue",
  "navy",
] as const;
export type ThemePrimary = (typeof THEME_PRIMARIES)[number];

// Body-text ink, darkest to softest, then the brand-tinted near-black. Dark
// halves mirror the gradient in white.
export const THEME_INKS = [
  "black",
  "near-black",
  "charcoal",
  "soft",
  "green-tinted",
] as const;
export type ThemeInk = (typeof THEME_INKS)[number];

export const THEME_STATUSES = ["kit", "brand-danger"] as const;
export type ThemeStatus = (typeof THEME_STATUSES)[number];

export const THEME_DARK_PRIMARIES = ["teal", "sky"] as const;
export type ThemeDarkPrimary = (typeof THEME_DARK_PRIMARIES)[number];

// Fine steps, denser below the default: the reskin is expected to tighten
// rather than loosen. Density and text scale are factors over the kit's rem
// tables; 1 writes nothing.
export const THEME_RADII = [0, 1, 2, 3, 4, 6, 8, "full"] as const;
export type ThemeRadius = (typeof THEME_RADII)[number];

export const THEME_DENSITIES = [0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3] as const;
export type ThemeDensity = (typeof THEME_DENSITIES)[number];

export const THEME_TEXT_SCALES = [0.85, 0.9, 0.95, 1, 1.05, 1.1] as const;
export type ThemeTextScale = (typeof THEME_TEXT_SCALES)[number];

export type Theme = {
  ramp: ThemeRamp;
  primary: ThemePrimary;
  ink: ThemeInk;
  status: ThemeStatus;
  darkPrimary: ThemeDarkPrimary;
  radius: ThemeRadius;
  density: ThemeDensity;
  textScale: ThemeTextScale;
};

export const DEFAULT_THEME: Theme = {
  ramp: "neutral",
  primary: "current",
  ink: "charcoal",
  status: "kit",
  darkPrimary: "teal",
  radius: 4,
  density: 1,
  textScale: 1,
};

// Every ramp pins its hover and active states as literals rather than
// trusting the kit's formula (a mix toward the ink), which already makes a
// pressed base-100 darker than a resting base-200 and greys a tinted ramp.
// Generated once in oklab (hover halfway to the next level, active 80% of
// the way, base-300 toward the border) and verified for lightness ordering
// and contrast; edit any value by eye.
type RampHalf = {
  base100: string;
  base200: string;
  base300: string;
  border: string;
  base100Hover: string;
  base100Active: string;
  base200Hover: string;
  base200Active: string;
  base300Hover: string;
  base300Active: string;
};
type Halves<T> = { light: T; dark: T };

const RAMPS: Record<ThemeRamp, Halves<RampHalf>> = {
  neutral: {
    light: {
      base100: "#ffffff",
      base200: "#f2f2f2",
      base300: "#e4e4e4",
      border: "#cacaca",
      base100Hover: "#f8f8f8",
      base100Active: "#f5f5f5",
      base200Hover: "#ebebeb",
      base200Active: "#e7e7e7",
      base300Hover: "#d7d7d7",
      base300Active: "#cfcfcf",
    },
    dark: {
      base100: "#18181b",
      base200: "#27272a",
      base300: "#3f3f46",
      border: "#52525b",
      base100Hover: "#1f1f22",
      base100Active: "#242427",
      base200Hover: "#333338",
      base200Active: "#3a3a40",
      base300Hover: "#484850",
      base300Active: "#4e4e57",
    },
  },
  // GFF Tone as the page, two warmer creams below it.
  tone: {
    light: {
      base100: "#fef7f1",
      base200: "#f6ebe1",
      base300: "#ebddd1",
      border: "#dbccc0",
      base100Hover: "#faf1e9",
      base100Active: "#f8ede4",
      base200Hover: "#f0e4d9",
      base200Active: "#ede0d4",
      base300Hover: "#e3d4c8",
      base300Active: "#decfc3",
    },
    dark: {
      base100: "#1c1917",
      base200: "#292524",
      base300: "#44403c",
      border: "#57534e",
      base100Hover: "#221f1d",
      base100Active: "#262321",
      base200Hover: "#363230",
      base200Active: "#3e3a37",
      base300Hover: "#4d4945",
      base300Active: "#534f4a",
    },
  },
  // White tinted toward GFF Deep Green; near-black green in the dark.
  cool: {
    light: {
      base100: "#ffffff",
      base200: "#f2f5f4",
      base300: "#e2e8e7",
      border: "#c6d2d0",
      base100Hover: "#f8faf9",
      base100Active: "#f5f7f6",
      base200Hover: "#eaeeed",
      base200Active: "#e5ebea",
      base300Hover: "#d4dddb",
      base300Active: "#ccd6d5",
    },
    dark: {
      base100: "#0f1f1d",
      base200: "#182c29",
      base300: "#243f39",
      border: "#365650",
      base100Hover: "#132523",
      base100Active: "#162927",
      base200Hover: "#1e3531",
      base200Active: "#223b36",
      base300Hover: "#2d4a44",
      base300Active: "#32514b",
    },
  },
};

const RAMP_TOKENS: [keyof RampHalf, string][] = [
  ["base100", "base-100"],
  ["base200", "base-200"],
  ["base300", "base-300"],
  ["border", "border"],
  ["base100Hover", "base-100-hover"],
  ["base100Active", "base-100-active"],
  ["base200Hover", "base-200-hover"],
  ["base200Active", "base-200-active"],
  ["base300Hover", "base-300-hover"],
  ["base300Active", "base-300-active"],
];

const INKS: Record<ThemeInk, Halves<string>> = {
  black: { light: "#111111", dark: "#ffffff" },
  "near-black": { light: "#1f1f1f", dark: "#fafafa" },
  charcoal: { light: "#2a2a2a", dark: "#f4f4f4" },
  soft: { light: "#383838", dark: "#ebebeb" },
  "green-tinted": { light: "#1c2d2a", dark: "#fef7f1" },
};

type Fill = { color: string; content: string };

// Light-mode primaries. "current" is the shipped, off-brand teal-green kept
// for comparison. GFF Teal is excluded here: white on it reaches only 3.1:1.
const PRIMARIES: Record<ThemePrimary, Fill> = {
  current: { color: "#0e706c", content: "#ffffff" },
  "deep-green": { color: "#00413c", content: "#ffffff" },
  "logo-green": { color: "#0a544f", content: "#ffffff" },
  blue: { color: "#21568c", content: "#ffffff" },
  navy: { color: "#2d2c63", content: "#ffffff" },
};

const DARK_PRIMARIES: Record<ThemeDarkPrimary, Fill> = {
  teal: { color: "#1fa29c", content: "#0f1f1d" },
  sky: { color: "#91c2e8", content: "#0f1f1d" },
};

type StatusSet = { success: Fill; warning: Fill; danger: Fill };
const KIT_STATUS: Halves<StatusSet> = {
  light: {
    success: { color: "#009f70", content: "#ffffff" },
    warning: { color: "#d97706", content: "#ffffff" },
    danger: { color: "#f04d44", content: "#ffffff" },
  },
  dark: {
    success: { color: "#4ade80", content: "#052e16" },
    warning: { color: "#facc15", content: "#422006" },
    danger: { color: "#f87171", content: "#450a0a" },
  },
};
// GFF Maroon as danger; the dark half is Maroon lifted toward white.
const STATUSES: Record<ThemeStatus, Halves<StatusSet>> = {
  kit: KIT_STATUS,
  "brand-danger": {
    light: {
      ...KIT_STATUS.light,
      danger: { color: "#68152b", content: "#ffffff" },
    },
    dark: {
      ...KIT_STATUS.dark,
      danger: { color: "#ab767d", content: "#2b0a12" },
    },
  },
};

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

type ThemeVars = Record<string, string | null>;

const pair = (light: string, dark: string) => `light-dark(${light}, ${dark})`;

function colorVars(t: Theme): ThemeVars {
  const vars: ThemeVars = {};
  const ramp = RAMPS[t.ramp];
  for (const [key, token] of RAMP_TOKENS) {
    vars[`--color-${token}`] = pair(ramp.light[key], ramp.dark[key]);
  }
  const ink = INKS[t.ink];
  vars["--color-base-content"] = pair(ink.light, ink.dark);
  const primary = PRIMARIES[t.primary];
  const darkPrimary = DARK_PRIMARIES[t.darkPrimary];
  vars["--color-primary"] = pair(primary.color, darkPrimary.color);
  vars["--color-primary-content"] = pair(primary.content, darkPrimary.content);
  const status = STATUSES[t.status];
  for (const intent of ["success", "warning", "danger"] as const) {
    vars[`--color-${intent}`] = pair(
      status.light[intent].color,
      status.dark[intent].color,
    );
    vars[`--color-${intent}-content`] = pair(
      status.light[intent].content,
      status.dark[intent].content,
    );
  }
  return vars;
}

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
  const vars = colorVars(t);
  vars["--radius"] =
    t.radius === DEFAULT_THEME.radius
      ? null
      : t.radius === "full"
        ? "9999px"
        : `${t.radius}px`;
  scaledRem(vars, DENSITY_BASE_REM, t.density);
  scaledRem(vars, TEXT_BASE_REM, t.textScale);
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
      ramp: pick(THEME_RAMPS, v.ramp, DEFAULT_THEME.ramp),
      primary: pick(THEME_PRIMARIES, v.primary, DEFAULT_THEME.primary),
      ink: pick(THEME_INKS, v.ink, DEFAULT_THEME.ink),
      status: pick(THEME_STATUSES, v.status, DEFAULT_THEME.status),
      darkPrimary: pick(
        THEME_DARK_PRIMARIES,
        v.darkPrimary,
        DEFAULT_THEME.darkPrimary,
      ),
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
