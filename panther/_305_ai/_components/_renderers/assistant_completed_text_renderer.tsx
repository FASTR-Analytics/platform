// Copyright 2023-2026, Tim Roberton, All rights reserved.
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

export function AssistantCompletedTextRenderer(p: {
  item: Extract<DisplayItem, { type: "assistant_text" }>;
  markdownStyle?: CustomMarkdownStyleOptions;
  messageStyle?: MessageStyle;
}) {
  const bg = p.messageStyle?.background ?? "bg-primary/10";
  const text = p.messageStyle?.text ?? "text-primary";

  return (
    <div class="w-fit max-w-full">
      <div
        class={`py-4 w-fit max-w-full rounded text-sm ${bg} ${text} ${MARKDOWN_BASE_STYLES}`}
        style={deriveMarkdownCssVars(p.markdownStyle)}
        innerHTML={md.render(p.item.text)}
      />
    </div>
  );
}
