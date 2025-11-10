// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";

type Props = {
  text: string;
  isComplete: boolean;
};

export const StreamingTextRenderer: Component<Props> = (props) => {
  return (
    <div class="w-fit max-w-full">
      <div class="ui-pad bg-primary/10 text-primary relative w-fit max-w-full rounded font-mono text-sm">
        <div class="whitespace-pre-wrap">{props.text}</div>
        {!props.isComplete && (
          <span class="animate-pulse ml-0.5 inline-block">▊</span>
        )}
      </div>
    </div>
  );
};
