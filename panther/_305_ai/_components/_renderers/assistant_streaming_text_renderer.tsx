// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomMarkdownStyleOptions } from "../../deps.ts";
import type { MessageStyle } from "../../_core/types.ts";
import {
  deriveMarkdownCssVars,
  MARKDOWN_BASE_STYLES,
  md,
} from "./_markdown_utils.ts";

type Props = {
  text: string;
  messageStyle?: MessageStyle;
  markdownStyle?: CustomMarkdownStyleOptions;
};

export function AssistantStreamingTextRenderer(p: Props) {
  const bg = p.messageStyle?.background ?? "bg-primary-subtle";
  const text = p.messageStyle?.text ?? "text-primary";
  const messageClass = `${bg} ${text}`;

  return (
    <div class="w-fit max-w-full">
      <div
        class={`py-4 w-fit max-w-full rounded text-sm ${messageClass} ${MARKDOWN_BASE_STYLES} ui-streaming-cursor`}
        style={deriveMarkdownCssVars(p.markdownStyle)}
        innerHTML={md.render(p.text)}
      />
    </div>
  );
}
