// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { DisplayItem } from "../../_core/types.ts";

export const ToolSuccessRenderer: Component<{
  item: Extract<DisplayItem, { type: "tool_success" }>;
}> = (props) => {
  return (
    <div class="text-success/80 text-sm italic">
      {props.item.message}
    </div>
  );
};
