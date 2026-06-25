// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, Icon, Show, t3 } from "../../deps.ts";
import type { DisplayItem } from "../../_core/types.ts";

export function ToolSuccessRenderer(p: {
  item: Extract<DisplayItem, { type: "tool_success" }>;
}) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        class="text-success/80 hover:text-success flex w-full cursor-pointer items-start gap-1 text-left text-sm transition-colors"
      >
        <div class="mt-0.5">
          {expanded()
            ? <Icon iconName="chevronDown" class="h-4 w-4" />
            : <Icon iconName="chevronRight" class="h-4 w-4" />}
        </div>
        <span class="italic">{p.item.message}</span>
      </button>

      <Show when={expanded()}>
        <div class="ml-5 mt-1">
          <div class="text-success/60 mb-1 text-xs font-medium">
            {t3({ en: "Result:", fr: "Résultat :" })}
          </div>
          <div class="text-success/80 bg-success/5 whitespace-pre-wrap rounded p-2 font-mono text-xs">
            {p.item.result}
          </div>
        </div>
      </Show>
    </div>
  );
}
