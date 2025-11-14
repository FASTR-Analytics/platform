// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Component, Match, Show, Switch } from "solid-js";
import type { MessageStyle } from "../../_core/types.ts";
import { MARKDOWN_STYLES, md } from "./_markdown_utils.ts";
import { SpinningCursor } from "./spinning_cursor.tsx";

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
        <Switch>
          <Match when={props.renderMarkdown}>
            <div innerHTML={md.render(props.text)} />
            <Show when={!props.isComplete}>
              <SpinningCursor />
            </Show>
          </Match>
          <Match when={!props.renderMarkdown}>
            <div class="whitespace-pre-wrap break-words">{props.text}</div>
            <Show when={!props.isComplete}>
              <SpinningCursor />
            </Show>
          </Match>
        </Switch>
      </div>
    </div>
  );
};
