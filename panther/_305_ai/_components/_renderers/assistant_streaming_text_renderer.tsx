// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomMarkdownStyleOptions } from "../../deps.ts";
import type { MessageStyle } from "../../_core/types.ts";
import { deriveMarkdownCssVars, markdownClasses } from "../../deps.ts";
import { md } from "./_markdown_utils.ts";
import { messageWashClasses } from "./_message_wash.ts";

type Props = {
  text: string;
  messageStyle?: MessageStyle;
  markdownStyle?: CustomMarkdownStyleOptions;
};

export function AssistantStreamingTextRenderer(p: Props) {
  const wash = messageWashClasses(p.messageStyle?.intent ?? "primary");

  return (
    <div class="w-fit max-w-full">
      <div
        class={`py-4 w-fit max-w-full rounded text-sm ${wash} ${
          markdownClasses(p.markdownStyle)
        } ui-streaming-cursor`}
        style={deriveMarkdownCssVars(p.markdownStyle)}
        innerHTML={md.render(p.text)}
      />
    </div>
  );
}
