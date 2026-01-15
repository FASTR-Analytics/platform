// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { renderFigurePrimitives, type RenderContext } from "../deps.ts";
import type { MeasuredSankey } from "../types.ts";

export function renderSankey(
  rc: RenderContext,
  measured: MeasuredSankey,
): void {
  const bgColor = measured.measuredSurrounds.s.backgroundColor;
  if (bgColor !== "none") {
    rc.rRect(measured.measuredSurrounds.outerRcd, {
      fillColor: bgColor,
    });
  }

  renderFigurePrimitives(rc, measured.primitives);
}
