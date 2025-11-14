// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type RenderContext, renderFigurePrimitives } from "../deps.ts";
import type { MeasuredChartOV } from "../types.ts";

export function renderChartOV(rc: RenderContext, mChartOV: MeasuredChartOV) {
  // Render background (simple, non-interactive, doesn't need to be a primitive)
  if (mChartOV.measuredSurrounds.s.backgroundColor !== "none") {
    rc.rRect(mChartOV.measuredSurrounds.outerRcd, {
      fillColor: mChartOV.measuredSurrounds.s.backgroundColor,
    });
  }

  // Render all chart elements via primitives
  renderFigurePrimitives(rc, mChartOV.primitives);
}
