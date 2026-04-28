// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString } from "./deps.ts";

export type PatternType =
  | "ovals"
  | "circles"
  | "dots"
  | "lines"
  | "grid"
  | "chevrons"
  | "waves"
  | "noise"
  | "none";

export type PatternConfig = {
  type: PatternType;
  baseColor: ColorKeyOrString;
  scale?: number;
  contrast?: number;
  seed?: number;
};

export function isPatternConfig(
  bg: ColorKeyOrString | PatternConfig,
): bg is PatternConfig {
  return (
    bg !== null &&
    typeof bg === "object" &&
    "type" in bg &&
    typeof (bg as PatternConfig).type === "string"
  );
}

export function getBackgroundBaseColor(
  bg: ColorKeyOrString | PatternConfig,
): ColorKeyOrString {
  return isPatternConfig(bg) ? bg.baseColor : bg;
}

export function getPatternDefaults(
  type: PatternType,
): Omit<PatternConfig, "type" | "baseColor"> {
  switch (type) {
    case "ovals":
      return { contrast: 0.5, scale: 1 };
    case "circles":
      return { contrast: 0.5, scale: 1 };
    case "dots":
      return { contrast: 0.5, scale: 1 };
    case "lines":
      return { contrast: 0.4, scale: 1 };
    case "grid":
      return { contrast: 0.35, scale: 1 };
    case "chevrons":
      return { contrast: 0.4, scale: 1 };
    case "waves":
      return { contrast: 0.5, scale: 1 };
    case "noise":
      return { contrast: 0.4, scale: 1 };
    case "none":
      return { contrast: 0, scale: 1 };
  }
}
