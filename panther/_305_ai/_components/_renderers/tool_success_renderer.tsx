// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, Show } from "../../deps.ts";
import type { Component } from "../../deps.ts";
import type { DisplayItem } from "../../_core/types.ts";

export const ToolSuccessRenderer: Component<{
  item: Extract<DisplayItem, { type: "tool_success" }>;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="border-l-2 border-success/30 pl-3 my-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        class="flex items-center gap-2 text-sm text-success/80 hover:text-success transition-colors"
      >
        <span class="text-xs">{expanded() ? "▼" : "▶"}</span>
        <span class="italic">{props.item.message}</span>
      </button>

      <Show when={expanded()}>
        <div class="mt-2">
          <div class="text-xs font-medium text-success/60 mb-1">Result:</div>
          <div class="font-mono text-xs text-success/80 whitespace-pre-wrap bg-success/5 rounded p-2">
            {props.item.result}
          </div>
        </div>
      </Show>
    </div>
  );
};
