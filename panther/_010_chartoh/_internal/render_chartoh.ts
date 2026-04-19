// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type RenderContext,
  renderFigureBackground,
  renderFigurePrimitives,
} from "../deps.ts";
import type { MeasuredChartOH } from "../types.ts";

export function renderChartOH(rc: RenderContext, m: MeasuredChartOH): void {
  renderFigureBackground(rc, m.measuredSurrounds);
  renderFigurePrimitives(rc, m.primitives);
}
