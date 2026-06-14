// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { renderFigureBackground, renderFigurePrimitives } from "../deps.ts";
import type { RenderContext } from "../deps.ts";
import type { MeasuredSimpleViz } from "../types.ts";

export function renderSimpleViz(
  rc: RenderContext,
  measured: MeasuredSimpleViz,
): void {
  renderFigureBackground(rc, measured.measuredSurrounds);
  renderFigurePrimitives(rc, measured.primitives);
}
