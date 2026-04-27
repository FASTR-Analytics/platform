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
  opacity?: number;
  scale?: number;
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
