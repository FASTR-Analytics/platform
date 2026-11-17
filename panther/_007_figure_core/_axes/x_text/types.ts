// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../../deps.ts";

export type XTextAxisMeasuredInfo = {
  uniformSubChartWidth: number;
  slotExtent: number;
  // Reading-direction cap for vertical tick labels (the rotated label's
  // vertical extent, i.e. axis thickness). Only meaningful when
  // verticalTickLabels is true; mirrors yTextAxis.maxTickLabelW.
  verticalTickLabelMaxHeight: number;
  xAxisRcd: RectCoordsDims;
};
