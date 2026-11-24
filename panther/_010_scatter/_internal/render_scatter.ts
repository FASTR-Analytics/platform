// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type RenderContext,
  renderFigureBackground,
  renderFigurePrimitives,
} from "../deps.ts";
import type { MeasuredScatter } from "../types.ts";

export function renderScatter(rc: RenderContext, measured: MeasuredScatter) {
  renderFigureBackground(rc, measured.measuredSurrounds);
  renderFigurePrimitives(rc, measured.primitives);
}
