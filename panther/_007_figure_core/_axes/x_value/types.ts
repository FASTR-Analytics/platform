// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";
import type { XAxisHeightInfoBase } from "../../types.ts";

export type XValueAxisHeightInfo = XAxisHeightInfoBase & {
  xAxisTickValues: number[][]; // indexed by i_lane — mirror of YValueAxisWidthInfo.yAxisTickValues (indexed by i_tier)
  tickLabelFormatter: (v: number) => string;
  maxTickLabelW: number;
};

export type XValueAxisMeasuredInfo = {
  xAxisRcd: RectCoordsDims;
  uniformSubChartWidth: number;
  xValueAxisHeightInfo: XValueAxisHeightInfo;
};
