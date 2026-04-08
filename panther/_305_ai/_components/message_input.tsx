// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Component, Show } from "solid-js";
import { Button, t3, TextArea } from "../deps.ts";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isGenerating?: boolean;
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
            t3({ en: "Type your message... (Shift+Enter for new line)", fr: "Tapez votre message... (Maj+Entrée pour un saut de ligne)" })}
          height={props.height ?? "100px"}
          // mono
          fullWidth
        />
      </div>
      <div
        class="ui-gap-sm flex flex-none flex-col items-start"
        data-ai-submit-wrapper
      >
        <Button
          onClick={props.onSubmit}
          disabled={props.disabled}
          intent="primary"
        >
          {props.submitLabel ?? t3({ en: "Submit", fr: "Envoyer" })}
        </Button>
        <Show when={props.isGenerating && props.onStop}>
          <Button onClick={() => props.onStop!()} intent="neutral">
            {t3({ en: "Stop", fr: "Arrêter" })}
          </Button>
        </Show>
      </div>
    </div>
  );
};
