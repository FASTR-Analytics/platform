// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { DisplayItem } from "../../_core/types.ts";

export const ToolErrorRenderer: Component<{
  item: Extract<DisplayItem, { type: "tool_error" }>;
}> = (props) => {
  return (
    <div class="ui-pad w-fit max-w-full rounded bg-red-100">
      <div class="text-sm text-red-900">
        <div class="font-bold">Error: {props.item.toolName}</div>
        <div class="whitespace-pre-wrap">{props.item.errorMessage}</div>
      </div>
    </div>
  );
};
