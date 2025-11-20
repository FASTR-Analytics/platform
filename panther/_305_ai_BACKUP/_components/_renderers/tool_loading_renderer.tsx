// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { DisplayItem } from "../../_core/types.ts";
import { SpinningCursor } from "./spinning_cursor.tsx";

export const ToolLoadingRenderer: Component<{
  item: Extract<DisplayItem, { type: "tool_in_progress" }>;
}> = (props) => {
  return (
    <div class="text-neutral italic">
      <SpinningCursor class="mr-1 inline-block" />
      {props.item.label ?? `Processing ${props.item.toolName}...`}
    </div>
  );
};
