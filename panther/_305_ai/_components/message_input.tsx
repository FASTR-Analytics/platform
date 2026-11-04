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
  placeholder?: string;
  submitLabel?: string;
  height?: string;
};

// Enter sends, Shift+Enter breaks the line, and an Enter that confirms an
// IME composition does neither. Safari ends the composition before that
// Enter's keydown, which then reports keyCode 229 instead.
export function submitsOnKey(
  e: Pick<KeyboardEvent, "key" | "shiftKey" | "isComposing" | "keyCode">,
): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing &&
    e.keyCode !== 229;
}

export function MessageInput(p: Props) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (submitsOnKey(e)) {
      e.preventDefault();
      p.onSubmit();
    }
  };

  return (
    <div class="ui-pad ui-gap bg-primary-subtle flex w-full flex-none">
      <div class="w-0 flex-1" data-ai-input-wrapper>
        <TextArea
          value={p.value}
          onChange={p.onChange}
          onKeyDown={handleKeyDown}
          placeholder={p.placeholder ??
            t3({
              en: "Type your message... (Shift+Enter for new line)",
              fr: "Tapez votre message... (Maj+Entrée pour un saut de ligne)",
              pt: "Escreva a sua mensagem... (Shift+Enter para nova linha)",
              th: "พิมพ์ข้อความของคุณ... (Shift+Enter เพื่อขึ้นบรรทัดใหม่)",
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
        <Button onClick={p.onSubmit} intent="primary">
          {p.submitLabel ??
            t3({ en: "Submit", fr: "Envoyer", pt: "Enviar", th: "ส่ง" })}
        </Button>
        <Show when={p.isGenerating && p.onStop}>
          <Button onClick={() => p.onStop!()} intent="neutral">
            {t3({ en: "Stop", fr: "Arrêter", pt: "Parar", th: "หยุด" })}
          </Button>
        </Show>
      </div>
    </div>
  );
}
