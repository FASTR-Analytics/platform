// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type KeyColors, setKeyColors } from "./deps.ts";

type KeyColorsKey = keyof KeyColors;

type ColorVariable =
  | "transparent"
  | "black"
  | "white"
  | "base-100"
  | "base-200"
  | "base-300"
  | "base-content"
  | "primary"
  | "primary-content"
  | "neutral"
  | "neutral-content"
  | "success"
  | "success-content"
  | "warning"
  | "warning-content"
  | "danger"
  | "danger-content";

type Scheme = "light" | "dark";

// A custom property computes to its raw text, so reading --color-* off
// :root returns the light-dark() pair itself. A probe element's `color`
// resolves the pair (and any color-mix()) against the probe's color-scheme:
// the document's current one, or the one given.
export function getCSSColor(colorName: ColorVariable, scheme?: Scheme): string {
  const probe = document.createElement("span");
  probe.style.color = `var(--color-${colorName})`;
  if (scheme !== undefined) probe.style.setProperty("color-scheme", scheme);
  document.documentElement.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

export function getCSSVariable(variableName: string): string {
  const varName = variableName.startsWith("--")
    ? variableName
    : `--${variableName}`;
  const rootStyles = getComputedStyle(document.documentElement);
  return rootStyles.getPropertyValue(varName).trim();
}

export function setCSSVariable(variableName: string, value: string): void {
  const varName = variableName.startsWith("--")
    ? variableName
    : `--${variableName}`;
  document.documentElement.style.setProperty(varName, value);
}

const KEY_COLOR_TOKENS: Record<KeyColorsKey, ColorVariable> = {
  base100: "base-100",
  base200: "base-200",
  base300: "base-300",
  baseContent: "base-content",
  primary: "primary",
  primaryContent: "primary-content",
  neutral: "neutral",
  neutralContent: "neutral-content",
  success: "success",
  successContent: "success-content",
  warning: "warning",
  warningContent: "warning-content",
  danger: "danger",
  dangerContent: "danger-content",
};

function readKeyColors(scheme: Scheme): KeyColors {
  const out = {} as KeyColors;
  for (const [key, token] of Object.entries(KEY_COLOR_TOKENS)) {
    out[key as KeyColorsKey] = getCSSColor(token, scheme);
  }
  return out;
}

// Alternate entry to setKeyColors that reads the --color-* tokens: the light
// halves as the foundation and the dark halves as the dark companion,
// whatever scheme the document is in when it runs. Routes through
// setKeyColors, so it shares the same once-only guard: call this OR
// setKeyColors, once — not both.
export function setKeyColorsFromCss(
  options?: { remapNearBlackOnDark?: boolean },
) {
  setKeyColors(readKeyColors("light"), readKeyColors("dark"), options);
}
