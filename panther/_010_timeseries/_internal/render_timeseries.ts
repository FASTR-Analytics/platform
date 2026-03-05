// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type RenderContext,
  renderFigureBackground,
  renderFigurePrimitives,
} from "../deps.ts";
import type { MeasuredTimeseries } from "../types.ts";

export function renderTimeseries(
  rc: RenderContext,
  mTimeseries: MeasuredTimeseries,
) {
  renderFigureBackground(rc, mTimeseries.measuredSurrounds);
  renderFigurePrimitives(rc, mTimeseries.primitives);
}
