// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, Show } from "../../deps.ts";
import type { Component } from "../../deps.ts";
import type { DisplayItem } from "../../_core/types.ts";

export const ToolErrorRenderer: Component<{
  item: Extract<DisplayItem, { type: "tool_error" }>;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  // Only show details button if we have additional stack trace info
  const hasStackTrace = () => props.item.result !== props.item.errorMessage;

  return (
    <div class="ui-pad w-fit max-w-full rounded bg-danger/10 border border-danger/20">
      <div class="text-sm">
        <div class="flex items-center gap-2">
          <div class="text-danger font-medium">
            Tool error: {props.item.toolName}
          </div>
          <Show when={hasStackTrace()}>
            <button
              type="button"
              onClick={() => setExpanded(!expanded())}
              class="text-xs text-danger/60 hover:text-danger/80 transition-colors"
            >
              {expanded() ? "▼" : "▶"} stack trace
            </button>
          </Show>
        </div>

        <div class="text-danger/80 mt-1">
          {props.item.errorMessage}
        </div>

        <Show when={expanded() && hasStackTrace()}>
          <div class="mt-3 pt-3 border-t border-danger/20">
            <pre class="font-mono text-[10px] text-danger/80 whitespace-pre-wrap bg-danger/5 rounded p-2 overflow-x-auto">
              {props.item.result}
            </pre>
          </div>
        </Show>
      </div>
    </div>
  );
};
