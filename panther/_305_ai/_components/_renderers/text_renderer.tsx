// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Component, Match, Switch } from "solid-js";
import type { CustomMarkdownStyleOptions } from "../../deps.ts";
import type { DisplayItem, MessageStyle } from "../../_core/types.ts";
import {
  deriveMarkdownCssVars,
  MARKDOWN_BASE_STYLES,
  md,
} from "./_markdown_utils.ts";

export const TextRenderer: Component<{
  item: Extract<DisplayItem, { type: "text" }>;
  userMessageStyle?: MessageStyle;
  assistantMessageStyle?: MessageStyle;
  markdownStyle?: CustomMarkdownStyleOptions;
}> = (props) => {
  const userBg = props.userMessageStyle?.background ?? "bg-base-200";
  const userText = props.userMessageStyle?.text ?? "text-base-content";
  const userClass = `${userBg} ${userText}`;

  const assistantBg = props.assistantMessageStyle?.background ??
    "bg-primary/10";
  const assistantText = props.assistantMessageStyle?.text ?? "text-primary";
  const assistantClass = `${assistantBg} ${assistantText}`;

  return (
    <Switch>
      <Match when={props.item.role === "user"}>
        <div class="ml-auto max-w-[80%]">
          <div
            class={`py-4 rounded text-right text-sm ${userClass} ${MARKDOWN_BASE_STYLES}`}
            style={deriveMarkdownCssVars(props.markdownStyle)}
            innerHTML={md.render(props.item.text)}
          />
        </div>
      </Match>
      <Match when={props.item.role === "assistant"}>
        <div class="w-fit max-w-full">
          <div
            class={`py-4 w-fit max-w-full rounded text-sm ${assistantClass} ${MARKDOWN_BASE_STYLES}`}
            style={deriveMarkdownCssVars(props.markdownStyle)}
            innerHTML={md.render(props.item.text)}
          />
        </div>
      </Match>
    </Switch>
  );
};
