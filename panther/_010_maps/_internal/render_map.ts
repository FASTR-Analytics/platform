// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type RenderContext,
  renderFigureBackground,
  renderFigurePrimitives,
} from "../deps.ts";
import type { MeasuredMap } from "../types.ts";

export function renderMap(rc: RenderContext, measured: MeasuredMap): void {
  renderFigureBackground(rc, measured.measuredSurrounds);
  renderFigurePrimitives(rc, measured.primitives);
}
