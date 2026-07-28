// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DisplayItem } from "../../_core/types.ts";

export function DefaultRenderer(p: { item: DisplayItem }) {
  return (
    <div class="ui-pad bg-base-200 w-fit max-w-full rounded">
      <div class="font-mono text-sm">
        <div class="text-base-content-muted mb-1 text-xs font-700">
          Unknown display item: {p.item.type}
        </div>
        <pre class="whitespace-pre-wrap text-xs">
          {JSON.stringify(p.item, null, 2)}
        </pre>
      </div>
    </div>
  );
}
