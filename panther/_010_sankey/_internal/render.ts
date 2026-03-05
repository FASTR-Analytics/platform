// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type RenderContext,
  renderFigureBackground,
  renderFigurePrimitives,
} from "../deps.ts";
import type { MeasuredSankey } from "../types.ts";

export function renderSankey(
  rc: RenderContext,
  measured: MeasuredSankey,
): void {
  renderFigureBackground(rc, measured.measuredSurrounds);
  renderFigurePrimitives(rc, measured.primitives);
}
