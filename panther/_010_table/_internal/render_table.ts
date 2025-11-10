// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { addSurrounds, type RenderContext } from "../deps.ts";
import type { MeasuredTable } from "../types.ts";
import {
  renderColAndColGroupHeaders,
  renderLines,
  renderRows,
} from "./render_helpers.ts";

export function renderTable(rc: RenderContext, mTable: MeasuredTable) {
  addSurrounds(rc, mTable.measuredSurrounds);
  //
  renderColAndColGroupHeaders(rc, mTable);
  renderRows(rc, mTable);
  renderLines(rc, mTable);
}
