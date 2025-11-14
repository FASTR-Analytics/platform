// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { DisplayItem } from "../../_core/types.ts";
import { MARKDOWN_STYLES, md } from "./_markdown_utils.ts";

export const TextRenderer: Component<{
  item: Extract<DisplayItem, { type: "text" }>;
  renderMarkdown?: boolean;
  userMessageClass?: string;
  assistantMessageClass?: string;
}> = (props) => {
  const defaultUserClass = "bg-base-200 text-base-content";
  const defaultAssistantClass = "bg-primary/10 text-primary";

  const userClass = props.userMessageClass ?? defaultUserClass;
  const assistantClass = props.assistantMessageClass ?? defaultAssistantClass;

  if (props.item.role === "user") {
    return (
      <div class="ml-auto max-w-[80%]">
        <div class={`ui-pad rounded text-right font-mono text-sm ${userClass}`}>
          <div class="whitespace-pre-wrap break-words">{props.item.text}</div>
        </div>
      </div>
    );
  }

  if (props.renderMarkdown) {
    return (
      <div class="w-fit max-w-full">
        <div
          class={`ui-pad w-fit max-w-full rounded font-mono text-sm ${assistantClass} ${MARKDOWN_STYLES}`}
          innerHTML={md.render(props.item.text)}
        />
      </div>
    );
  }

  return (
    <div class="w-fit max-w-full">
      <div
        class={`ui-pad w-fit max-w-full rounded font-mono text-sm ${assistantClass}`}
      >
        <div class="whitespace-pre-wrap break-words">{props.item.text}</div>
      </div>
    </div>
  );
};
