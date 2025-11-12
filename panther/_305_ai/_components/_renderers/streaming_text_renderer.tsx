// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";

type Props = {
  text: string;
  isComplete: boolean;
  assistantMessageClass?: string;
};

export const StreamingTextRenderer: Component<Props> = (props) => {
  const defaultClass = "bg-primary/10 text-primary";
  const messageClass = props.assistantMessageClass ?? defaultClass;

  return (
    <div class="w-fit max-w-full">
      <div
        class={`ui-pad relative w-fit max-w-full rounded font-mono text-sm ${messageClass}`}
      >
        <div class="whitespace-pre-wrap break-words">{props.text}</div>
        {!props.isComplete && (
          <span class="animate-pulse ml-0.5 inline-block">▊</span>
        )}
      </div>
    </div>
  );
};
