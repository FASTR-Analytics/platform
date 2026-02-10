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

export const ToolSuccessRenderer: Component<{
  item: Extract<DisplayItem, { type: "tool_success" }>;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        class="text-success/80 hover:text-success flex w-full cursor-pointer items-start gap-1 text-sm transition-colors"
      >
        <div class="mt-0.5">
          {expanded() ? (
            <ChevronDownIcon class="h-4 w-4" />
          ) : (
            <ChevronRightIcon class="h-4 w-4" />
          )}
        </div>
        <span class="italic">{props.item.message}</span>
      </button>

      <Show when={expanded()}>
        <div class="ml-5 mt-1">
          <div class="text-success/60 mb-1 text-xs font-medium">Result:</div>
          <div class="text-success/80 bg-success/5 whitespace-pre-wrap rounded p-2 font-mono text-xs">
            {props.item.result}
          </div>
        </div>
      </Show>
    </div>
  );
};
