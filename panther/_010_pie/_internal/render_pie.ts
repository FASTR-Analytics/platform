// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type RenderContext,
  renderFigureBackground,
  renderFigurePrimitives,
} from "../deps.ts";
import type { MeasuredPie } from "../types.ts";

export function renderPie(rc: RenderContext, measured: MeasuredPie): void {
  renderFigureBackground(rc, measured.measuredSurrounds);
  renderFigurePrimitives(rc, measured.primitives);
}
