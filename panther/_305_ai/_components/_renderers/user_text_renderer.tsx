// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { CustomMarkdownStyleOptions } from "../../deps.ts";
import type { DisplayItem, MessageStyle } from "../../_core/types.ts";
import {
  deriveMarkdownCssVars,
  MARKDOWN_BASE_STYLES,
  md,
} from "./_markdown_utils.ts";

// Strip AI context markers from display (but they're still sent to API)
function stripAIContext(text: string): string {
  return text.replace(/<<<.*?>>>/gs, "").trim();
}

export const UserTextRenderer: Component<{
  item: Extract<DisplayItem, { type: "user_text" }>;
  markdownStyle?: CustomMarkdownStyleOptions;
  messageStyle?: MessageStyle;
}> = (props) => {
  const bg = props.messageStyle?.background ?? "bg-base-200";
  const text = props.messageStyle?.text ?? "text-base-content";
  const displayText = stripAIContext(props.item.text);

  return (
    <div class="ml-auto max-w-[80%]">
      <div
        class={`rounded py-4 text-left text-sm ${bg} ${text} ${MARKDOWN_BASE_STYLES}`}
        style={deriveMarkdownCssVars(props.markdownStyle)}
        innerHTML={md.render(displayText)}
      />
    </div>
  );
};
