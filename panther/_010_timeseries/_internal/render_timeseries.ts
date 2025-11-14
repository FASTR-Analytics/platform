// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type RenderContext, renderFigurePrimitives } from "../deps.ts";
import type { MeasuredTimeseries } from "../types.ts";

export function renderTimeseries(
  rc: RenderContext,
  mTimeseries: MeasuredTimeseries,
) {
  // Render background (simple, non-interactive, doesn't need to be a primitive)
  if (mTimeseries.measuredSurrounds.s.backgroundColor !== "none") {
    rc.rRect(mTimeseries.measuredSurrounds.outerRcd, {
      fillColor: mTimeseries.measuredSurrounds.s.backgroundColor,
    });
  }

  // Render all chart elements via primitives
  renderFigurePrimitives(rc, mTimeseries.primitives);
}
