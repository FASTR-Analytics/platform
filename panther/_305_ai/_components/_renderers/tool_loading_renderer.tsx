// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { DisplayItem } from "../../_core/types.ts";

export const ToolLoadingRenderer: Component<{
  item: Extract<DisplayItem, { type: "tool_in_progress" }>;
}> = (props) => {
  return (
    <div class="text-neutral italic">
      {props.item.label ?? `Processing ${props.item.toolName}...`}
    </div>
  );
};
