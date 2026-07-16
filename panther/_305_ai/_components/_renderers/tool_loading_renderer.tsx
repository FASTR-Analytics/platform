// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { t3 } from "../../deps.ts";
import type { DisplayItem } from "../../_core/types.ts";
import { SpinningCursor } from "./spinning_cursor.tsx";

export function ToolLoadingRenderer(p: {
  item: Extract<DisplayItem, { type: "tool_in_progress" }>;
}) {
  return (
    <div class="text-base-content-muted text-sm italic">
      <SpinningCursor class="mr-1 inline-block" />
      {p.item.label ??
        t3({
          en: `Processing ${p.item.toolName}...`,
          fr: `Traitement de ${p.item.toolName}...`,
          pt: `A processar ${p.item.toolName}...`,
        })}
    </div>
  );
}
