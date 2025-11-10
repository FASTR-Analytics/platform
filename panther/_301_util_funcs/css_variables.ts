// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

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
  | "danger"
  | "danger-content";

/**
 * Get the value of a color CSS variable
 * @param colorName - Color variable name (e.g., "primary", "base-100", etc.)
 * @returns The trimmed value of the CSS color variable
 */
export function getCSSColor(colorName: ColorVariable): string {
  const varName = `--color-${colorName}`;
  const rootStyles = getComputedStyle(document.documentElement);
  return rootStyles.getPropertyValue(varName).trim();
}

/**
 * Get the value of any CSS variable from the root element
 * @param variableName - Full CSS variable name (with or without -- prefix)
 * @returns The trimmed value of the CSS variable
 */
export function getCSSVariable(variableName: string): string {
  const varName = variableName.startsWith("--")
    ? variableName
    : `--${variableName}`;
  const rootStyles = getComputedStyle(document.documentElement);
  return rootStyles.getPropertyValue(varName).trim();
}

/**
 * Set the value of a CSS variable on the root element
 * @param variableName - CSS variable name (with or without -- prefix)
 * @param value - The value to set
 */
export function setCSSVariable(variableName: string, value: string): void {
  const varName = variableName.startsWith("--")
    ? variableName
    : `--${variableName}`;
  document.documentElement.style.setProperty(varName, value);
}
