// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { DisplayItem } from "../../_core/types.ts";

export const TextRenderer: Component<{
  item: Extract<DisplayItem, { type: "text" }>;
  userMessageClass?: string;
  assistantMessageClass?: string;
}> = (props) => {
  const defaultUserClass = "bg-base-200 text-base-content";
  const defaultAssistantClass = "bg-primary/10 text-primary";

  const userClass = props.userMessageClass ?? defaultUserClass;
  const assistantClass = props.assistantMessageClass ?? defaultAssistantClass;

  return (
    <div
      class={props.item.role === "user"
        ? "ml-auto max-w-[80%]"
        : "w-fit max-w-full"}
    >
      <div
        class={props.item.role === "user"
          ? `ui-pad rounded text-right font-mono text-sm ${userClass}`
          : `ui-pad w-fit max-w-full rounded font-mono text-sm ${assistantClass}`}
      >
        <div class="whitespace-pre-wrap break-words">{props.item.text}</div>
      </div>
    </div>
  );
};
