// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { renderFigurePrimitives } from "../deps.ts";
import type { RenderContext } from "../deps.ts";
import type { MeasuredSimpleViz } from "../types.ts";

export function renderSimpleViz(
  rc: RenderContext,
  measured: MeasuredSimpleViz,
): void {
  // Render background (simple, non-interactive, doesn't need to be a primitive)
  if (measured.measuredSurrounds.s.backgroundColor !== "none") {
    rc.rRect(measured.measuredSurrounds.outerRcd, {
      fillColor: measured.measuredSurrounds.s.backgroundColor,
    });
  }

  // Render all elements via primitives (boxes, arrows, captions, legend)
  renderFigurePrimitives(rc, measured.primitives);
}
