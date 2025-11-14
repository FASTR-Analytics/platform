// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { DisplayItem, MessageStyle } from "../../_core/types.ts";
import { MARKDOWN_STYLES, md } from "./_markdown_utils.ts";

export const TextRenderer: Component<{
  item: Extract<DisplayItem, { type: "text" }>;
  renderMarkdown?: boolean;
  userMessageStyle?: MessageStyle;
  assistantMessageStyle?: MessageStyle;
}> = (props) => {
  const userBg = props.userMessageStyle?.background ?? "bg-base-200";
  const userText = props.userMessageStyle?.text ?? "text-base-content";
  const userClass = `${userBg} ${userText}`;

  const assistantBg = props.assistantMessageStyle?.background ??
    "bg-primary/10";
  const assistantText = props.assistantMessageStyle?.text ?? "text-primary";
  const assistantClass = `${assistantBg} ${assistantText}`;

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
