// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { DisplayItem } from "../../_core/types.ts";

export const TextRenderer: Component<{
  item: Extract<DisplayItem, { type: "text" }>;
}> = (props) => {
  return (
    <div
      class={props.item.role === "user"
        ? "ml-auto max-w-[80%]"
        : "w-fit max-w-full"}
    >
      <div
        class={props.item.role === "user"
          ? "ui-pad rounded bg-blue-100 text-right font-mono text-sm text-blue-900"
          : "ui-pad bg-primary/10 text-primary w-fit max-w-full rounded font-mono text-sm"}
      >
        <div class="whitespace-pre-wrap">{props.item.text}</div>
      </div>
    </div>
  );
};
