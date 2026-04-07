// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { setKeyColors } from "./deps.ts";

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

export function getCSSColor(colorName: ColorVariable): string {
  const varName = `--color-${colorName}`;
  const rootStyles = getComputedStyle(document.documentElement);
  return rootStyles.getPropertyValue(varName).trim();
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

export function setKeyColorsFromCss() {
  setKeyColors({
    base100: getCSSColor("base-100"),
    base200: getCSSColor("base-200"),
    base300: getCSSColor("base-300"),
    baseContent: getCSSColor("base-content"),
    primary: getCSSColor("primary"),
    primaryContent: getCSSColor("primary-content"),
    neutral: getCSSColor("neutral"),
    neutralContent: getCSSColor("neutral-content"),
    success: getCSSColor("success"),
    successContent: getCSSColor("success-content"),
    warning: getCSSColor("warning"),
    warningContent: getCSSColor("warning-content"),
    danger: getCSSColor("danger"),
    dangerContent: getCSSColor("danger-content"),
  });
}
