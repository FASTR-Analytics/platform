// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { CustomMarkdownStyleOptions } from "../../deps.ts";
import type { MessageStyle } from "../../_core/types.ts";
import {
  deriveMarkdownCssVars,
  MARKDOWN_BASE_STYLES,
  md,
} from "./_markdown_utils.ts";

type Props = {
  text: string;
  isComplete: boolean;
  assistantMessageStyle?: MessageStyle;
  markdownStyle?: CustomMarkdownStyleOptions;
};

export const StreamingTextRenderer: Component<Props> = (props) => {
  const assistantBg = props.assistantMessageStyle?.background ??
    "bg-primary/10";
  const assistantText = props.assistantMessageStyle?.text ?? "text-primary";
  const messageClass = `${assistantBg} ${assistantText}`;
  const cursorClass = () => (props.isComplete ? "" : "ui-streaming-cursor");

  return (
    <div class="w-fit max-w-full">
      <div
        class={`py-4 w-fit max-w-full rounded text-sm ${messageClass} ${MARKDOWN_BASE_STYLES} ${cursorClass()}`}
        style={deriveMarkdownCssVars(props.markdownStyle)}
        innerHTML={md.render(props.text)}
      />
    </div>
  );
};
