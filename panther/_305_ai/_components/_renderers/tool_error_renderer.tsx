// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  ChevronDownIcon,
  ChevronRightIcon,
  createSignal,
  Show,
} from "../../deps.ts";
import type { Component } from "../../deps.ts";
import type { DisplayItem } from "../../_core/types.ts";

export const ToolErrorRenderer: Component<{
  item: Extract<DisplayItem, { type: "tool_error" }>;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        class="flex w-full cursor-pointer items-start gap-1 text-sm text-danger/80 hover:text-danger transition-colors"
      >
        <div class="mt-0.5">
          {expanded()
            ? <ChevronDownIcon class="size-4" />
            : <ChevronRightIcon class="size-4" />}
        </div>
        <span class="font-medium">{props.item.errorMessage}</span>
      </button>

      <Show when={expanded()}>
        <div class="ml-5 mt-1 space-y-2">
          <div>
            <div class="text-xs font-medium text-danger/60 mb-1">Error:</div>
            <div class="text-xs text-danger/80">{props.item.errorDetails}</div>
          </div>

          <Show when={props.item.errorStack}>
            <div class="pt-2 border-t border-danger/20">
              <div class="text-xs font-medium text-danger/60 mb-1">
                Stack trace:
              </div>
              <pre class="font-mono text-[10px] text-danger/80 whitespace-pre-wrap bg-danger/5 rounded p-2 overflow-x-auto">
                {props.item.errorStack}
              </pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
