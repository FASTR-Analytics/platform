// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { resolveTableHeadersTransformed } from "./_internal/resolve_headers.ts";
import { CustomFigureStyle } from "./deps.ts";
import { getTableDataTransformed } from "./get_table_data.ts";
import type { ResolvedTableHeaders, TableData, TableInputs } from "./types.ts";

// Public entry to the label-resolution prelude the table renderer itself uses
// (resolved header labels + per-header sampleN digests), so exports reproduce
// the rendered header text without re-implementing slice extraction, roll-up
// exclusion or the min/max rule. Do NOT feed the returned `.data` back in as
// TableInputs.data — its labels are already resolved, and the renderer's own
// prelude would apply the formatter a second time.
export function resolveTableHeaders(
  data: TableData,
  style?: TableInputs["style"],
): ResolvedTableHeaders {
  const s = new CustomFigureStyle(style).getMergedTableStyle();
  return resolveTableHeadersTransformed(getTableDataTransformed(data), s);
}
