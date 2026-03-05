// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type RenderContext,
  renderFigureBackground,
  renderFigurePrimitives,
} from "../deps.ts";
import type { MeasuredChartOV } from "../types.ts";

export function renderChartOV(rc: RenderContext, mChartOV: MeasuredChartOV) {
  renderFigureBackground(rc, mChartOV.measuredSurrounds);
  renderFigurePrimitives(rc, mChartOV.primitives);
}
