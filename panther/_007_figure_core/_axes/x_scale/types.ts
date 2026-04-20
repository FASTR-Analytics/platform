// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";
import type { XAxisHeightInfoBase } from "../../types.ts";

export type XScaleAxisHeightInfo = XAxisHeightInfoBase & {
  xAxisTickValues: number[][]; // indexed by i_lane — mirror of YScaleAxisWidthInfo.yAxisTickValues (indexed by i_tier)
  guessMaxNTicks: number;
};

export type XScaleAxisMeasuredInfo = {
  xAxisRcd: RectCoordsDims;
  subChartAreaWidth: number;
  xScaleHeightInfo: XScaleAxisHeightInfo;
};
