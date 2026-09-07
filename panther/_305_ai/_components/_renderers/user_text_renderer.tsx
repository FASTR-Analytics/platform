// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomMarkdownStyleOptions } from "../../deps.ts";
import type { DisplayItem, MessageStyle } from "../../_core/types.ts";
import { deriveMarkdownCssVars, markdownClasses } from "../../deps.ts";
import { md } from "./_markdown_utils.ts";
import { messageWashClasses } from "./_message_wash.ts";

export function UserTextRenderer(p: {
  item: Extract<DisplayItem, { type: "user_text" }>;
  markdownStyle?: CustomMarkdownStyleOptions;
  messageStyle?: MessageStyle;
}) {
  const wash = messageWashClasses(p.messageStyle?.intent ?? "neutral");
  // Display text is clean by construction: ephemeral context is typed data
  // on the stored turn (never spliced into content), and v1 records are
  // stripped by the persistence migration.
  const displayText = p.item.text;

  return (
    <div class="ml-auto max-w-[80%]">
      <div
        class={`rounded py-4 text-left text-sm ${wash} ${
          markdownClasses(p.markdownStyle)
        }`}
        style={deriveMarkdownCssVars(p.markdownStyle)}
        innerHTML={md.render(displayText)}
      />
    </div>
  );
}
