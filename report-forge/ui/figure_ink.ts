// The ink a host draws its figures in. Report Forge never draws a figure, but
// it knows the ground each one stands on, so it is the one that picks the ink.

import type { FastrThemeColorOverride } from "../engine/report_fastr_themes.ts";

// Chart ink: rasters are transparent, so the report's CSS paints the ground
// behind a figure — but the chart's own text/axes/grid default to dark ink and
// would vanish on a dark ground. Whoever draws a figure asks for the ink of
// the ground it actually sits on (isDarkGroundBehind, report_html.ts); these
// palettes say WHICH ink that is. Series colors stay as configured.
export type FigureInkTheme = { text: string; axis: string; grid: string };

// Fallback light ink for dark grounds in styles without their own palette.
export const GENERIC_LIGHT_INK: FigureInkTheme = {
  text: "#E6E9ED",
  axis: "#9AA7B4",
  grid: "#3A4653",
};

// The DARK ink a light ground takes. A figure's stored style is whatever its
// dashboard wanted — a dark dashboard's white text arrives as white text —
// so a report re-inks every figure for the ground it actually sits on, in
// both directions, rather than only lightening on dark grounds.
export const GENERIC_DARK_INK: FigureInkTheme = {
  text: "#1B2430",
  axis: "#5C6672",
  grid: "#D5DAE0",
};

// The palette's own ink when its page is light; the generic dark ink for a
// dark page (whose light grounds are cards the theme has no ink for).
export function figureDarkInkForColors(
  colors: FastrThemeColorOverride | null | undefined,
): FigureInkTheme {
  if (colors) {
    const rgb = hexRgb(colors.page);
    if (rgb) {
      const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) /
        255;
      if (luminance >= 0.45 && hexRgb(colors.ink)) {
        return {
          text: colors.ink,
          axis: mixHex(colors.ink, colors.page, 0.35),
          grid: mixHex(colors.ink, colors.page, 0.75),
        };
      }
    }
  }
  return GENERIC_DARK_INK;
}

function hexRgb(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a: string, b: string, t: number): string {
  const ra = hexRgb(a);
  const rb = hexRgb(b);
  if (!ra || !rb) return a;
  const c = ra.map((v, i) => Math.round(v + (rb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// The palette's light ink, used when a figure's detected ground is dark. A
// palette with a dark page derives it from its own colors; everything else
// falls back to GENERIC_LIGHT_INK at the point of use.
export function figureLightInkForColors(
  colors: FastrThemeColorOverride | null | undefined,
): FigureInkTheme | undefined {
  if (!colors) return undefined;
  const rgb = hexRgb(colors.page);
  if (!rgb) return undefined;
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) /
    255;
  if (luminance >= 0.45) return undefined;
  return {
    text: colors.ink,
    axis: mixHex(colors.ink, colors.page, 0.35),
    grid: mixHex(colors.ink, colors.page, 0.75),
  };
}
