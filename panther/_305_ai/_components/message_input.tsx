// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  submitLabel?: string;
  height?: string;
};

export const MessageInput: Component<Props> = (props) => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      props.onSubmit();
    }
  };

  return (
    <div class="ui-pad ui-gap bg-primary/10 flex w-full flex-none">
      <div class="w-0 flex-1">
        <textarea
          class="border-base-300 bg-base-100 w-full rounded border px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
          style={{ height: props.height ?? "100px", resize: "vertical" }}
          value={props.value}
          onInput={(e) => props.onChange(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={props.disabled}
          placeholder={props.placeholder ??
            "Type your message... (Shift+Enter for new line)"}
        />
      </div>
      <div class="flex-none">
        <button
          class="bg-primary text-primary-content hover:bg-primary/90 disabled:bg-base-300 disabled:text-base-content rounded px-4 py-2 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          onClick={props.onSubmit}
          disabled={props.disabled}
        >
          {props.submitLabel ?? "Submit"}
        </button>
      </div>
    </div>
  );
};
