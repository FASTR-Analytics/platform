// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type RenderContext, renderFigurePrimitives } from "../deps.ts";
import type { MeasuredTable } from "../types.ts";
import {
  renderColAndColGroupHeaders,
  renderLines,
  renderRows,
} from "./render_helpers.ts";

export function renderTable(rc: RenderContext, mTable: MeasuredTable) {
  if (mTable.measuredSurrounds.s.backgroundColor !== "none") {
    rc.rRect(mTable.measuredSurrounds.outerRcd, {
      fillColor: mTable.measuredSurrounds.s.backgroundColor,
    });
  }
  renderFigurePrimitives(rc, mTable.primitives);
  //
  renderColAndColGroupHeaders(rc, mTable);
  renderRows(rc, mTable);
  renderLines(rc, mTable);
}
