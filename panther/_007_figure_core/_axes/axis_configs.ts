// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedXPeriodAxisStyle,
  MergedXScaleAxisStyle,
  MergedXTextAxisStyle,
  MergedYScaleAxisStyle,
  MergedYTextAxisStyle,
  PeriodType,
} from "../deps.ts";
import type { YScaleAxisData } from "../types.ts";

export type XAxisConfig =
  | {
    type: "text";
    indicatorHeaders: string[];
    axisStyle: MergedXTextAxisStyle;
  }
  | {
    type: "period";
    periodType: PeriodType;
    nTimePoints: number;
    timeMin: number;
    axisStyle: MergedXPeriodAxisStyle;
  }
  | {
    type: "scale";
    axisStyle: MergedXScaleAxisStyle;
  }
  | { type: "none" };

export type YAxisConfig =
  | {
    type: "scale";
    axisStyle: MergedYScaleAxisStyle;
    axisData: YScaleAxisData;
  }
  | {
    type: "text";
    axisStyle: MergedYTextAxisStyle;
  }
  | { type: "none" };
