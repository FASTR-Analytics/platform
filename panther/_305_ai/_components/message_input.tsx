// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import { Button, TextArea } from "../deps.ts";

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
      <div class="w-0 flex-1" data-ai-input-wrapper>
        <TextArea
          value={props.value}
          onChange={props.onChange}
          onKeyDown={handleKeyDown}
          placeholder={props.placeholder ??
            "Type your message... (Shift+Enter for new line)"}
          height={props.height ?? "100px"}
          mono
          fullWidth
        />
      </div>
      <div class="flex-none" data-ai-submit-wrapper>
        <Button
          onClick={props.onSubmit}
          disabled={props.disabled}
          intent="primary"
        >
          {props.submitLabel ?? "Submit"}
        </Button>
      </div>
    </div>
  );
};
