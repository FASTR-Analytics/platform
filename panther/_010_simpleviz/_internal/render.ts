// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { addSurrounds, renderPrimitives } from "../deps.ts";
import type { RenderContext } from "../deps.ts";
import type { MeasuredSimpleViz } from "../types.ts";

export function renderSimpleViz(
  rc: RenderContext,
  measured: MeasuredSimpleViz,
): void {
  addSurrounds(rc, measured.measuredSurrounds);
  renderPrimitives(rc, measured.primitives);
}
