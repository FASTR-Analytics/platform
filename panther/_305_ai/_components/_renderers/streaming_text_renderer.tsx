// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { MessageStyle } from "../../_core/types.ts";
import { MARKDOWN_STYLES, md } from "./_markdown_utils.ts";

type Props = {
  text: string;
  isComplete: boolean;
  renderMarkdown?: boolean;
  assistantMessageStyle?: MessageStyle;
};

export const StreamingTextRenderer: Component<Props> = (props) => {
  const assistantBg = props.assistantMessageStyle?.background ??
    "bg-primary/10";
  const assistantText = props.assistantMessageStyle?.text ?? "text-primary";
  const messageClass = `${assistantBg} ${assistantText}`;

  return (
    <div class="w-fit max-w-full">
      <div
        class={`ui-pad relative w-fit max-w-full rounded font-mono text-sm ${messageClass} ${
          props.renderMarkdown ? MARKDOWN_STYLES : ""
        }`}
      >
        {props.renderMarkdown
          ? (
            <>
              <span innerHTML={md.render(props.text)} />
              {!props.isComplete && (
                <span class="animate-pulse ml-0.5 inline-block">▊</span>
              )}
            </>
          )
          : (
            <>
              <div class="whitespace-pre-wrap break-words">{props.text}</div>
              {!props.isComplete && (
                <span class="animate-pulse ml-0.5 inline-block">▊</span>
              )}
            </>
          )}
      </div>
    </div>
  );
};
