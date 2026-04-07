// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type RenderContext,
  renderFigureBackground,
  renderFigurePrimitives,
} from "../deps.ts";
import type { MeasuredTable } from "../types.ts";

export function renderTable(rc: RenderContext, mTable: MeasuredTable) {
  renderFigureBackground(rc, mTable.measuredSurrounds);
  renderFigurePrimitives(rc, mTable.primitives);
}
