// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString } from "./types.ts";
import type { ContinuousPaletteName, PaletteName } from "./palettes.ts";

export type ScaleConfig =
  | PaletteName
  | `${PaletteName}:rev`
  | ColorKeyOrString[]
  | { min: ColorKeyOrString; max: ColorKeyOrString; reverse?: boolean }
  | {
    min: ColorKeyOrString;
    mid: ColorKeyOrString;
    max: ColorKeyOrString;
    reverse?: boolean;
  }
  | { palette: PaletteName; reverse?: boolean };

export type ContinuousScaleConfig =
  | ContinuousPaletteName
  | `${ContinuousPaletteName}:rev`
  | ColorKeyOrString[]
  | { min: ColorKeyOrString; max: ColorKeyOrString; reverse?: boolean }
  | {
    min: ColorKeyOrString;
    mid: ColorKeyOrString;
    max: ColorKeyOrString;
    reverse?: boolean;
  }
  | { palette: ContinuousPaletteName; reverse?: boolean };
