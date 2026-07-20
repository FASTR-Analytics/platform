// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomMarkdownStyleOptions } from "../../deps.ts";
import type { DisplayItem, MessageStyle } from "../../_core/types.ts";
import {
  deriveMarkdownCssVars,
  MARKDOWN_BASE_STYLES,
  md,
} from "./_markdown_utils.ts";

export function UserTextRenderer(p: {
  item: Extract<DisplayItem, { type: "user_text" }>;
  markdownStyle?: CustomMarkdownStyleOptions;
  messageStyle?: MessageStyle;
}) {
  const bg = p.messageStyle?.background ?? "bg-base-200";
  const text = p.messageStyle?.text ?? "text-base-content";
  // Display text is clean by construction: ephemeral context is typed data
  // on the stored turn (never spliced into content), and v1 records are
  // stripped by the persistence migration.
  const displayText = p.item.text;

  return (
    <div class="ml-auto max-w-[80%]">
      <div
        class={`rounded py-4 text-left text-sm ${bg} ${text} ${MARKDOWN_BASE_STYLES}`}
        style={deriveMarkdownCssVars(p.markdownStyle)}
        innerHTML={md.render(displayText)}
      />
    </div>
  );
}
