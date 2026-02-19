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
        class="text-neutral/80 hover:text-neutral flex w-full cursor-pointer items-start gap-1 text-left text-xs"
      >
        <div class="mt-0.5">
          {expanded()
            ? <ChevronDownIcon class="h-3 w-3" />
            : <ChevronRightIcon class="h-3 w-3" />}
        </div>
        <span class="font-medium">{props.item.errorMessage}</span>
      </button>

      <Show when={expanded()}>
        <div class="ml-5 mt-1 space-y-2">
          <div>
            <div class="mb-1 text-xs font-medium">Error:</div>
            <div class="text-xs">{props.item.errorDetails}</div>
          </div>

          <Show when={props.item.errorStack}>
            <div class="border-danger/20 border-t pt-2">
              <div class="text-danger/60 mb-1 text-xs font-medium">
                Stack trace:
              </div>
              <pre class="text-danger/80 bg-danger/5 overflow-x-auto whitespace-pre-wrap rounded p-2 font-mono text-[10px]">
                {props.item.errorStack}
              </pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
