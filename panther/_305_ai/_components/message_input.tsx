// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Show } from "solid-js";
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

export function MessageInput(p: Props) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      p.onSubmit();
    }
  };

  return (
    <div class="ui-pad ui-gap bg-primary/10 flex w-full flex-none">
      <div class="w-0 flex-1" data-ai-input-wrapper>
        <TextArea
          value={p.value}
          onChange={p.onChange}
          onKeyDown={handleKeyDown}
          placeholder={p.placeholder ??
            t3({
              en: "Type your message... (Shift+Enter for new line)",
              fr: "Tapez votre message... (Maj+Entrée pour un saut de ligne)",
            })}
          height={p.height ?? "100px"}
          // mono
          fullWidth
        />
      </div>
      <div
        class="ui-gap-sm flex flex-none flex-col items-start"
        data-ai-submit-wrapper
      >
        <Button
          onClick={p.onSubmit}
          disabled={p.disabled}
          intent="primary"
        >
          {p.submitLabel ?? t3({ en: "Submit", fr: "Envoyer" })}
        </Button>
        <Show when={p.isGenerating && p.onStop}>
          <Button onClick={() => p.onStop!()} intent="neutral">
            {t3({ en: "Stop", fr: "Arrêter" })}
          </Button>
        </Show>
      </div>
    </div>
  );
}
