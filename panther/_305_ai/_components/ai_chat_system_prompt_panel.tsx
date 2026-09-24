// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type AlertComponentProps, ModalContainer, t3 } from "../deps.ts";

export type AIChatSystemPromptPanelProps = {
  systemPrompt: string | Array<{ type: "text"; text: string }>;
};

type Props = AlertComponentProps<AIChatSystemPromptPanelProps, void>;

export function AIChatSystemPromptPanel(p: Props) {
  const text = typeof p.systemPrompt === "string"
    ? p.systemPrompt
    : p.systemPrompt.map((block) => block.text).join("\n\n");

  return (
    <ModalContainer
      title={t3({
        en: "System prompt",
        fr: "Prompt système",
        pt: "Prompt do sistema",
      })}
      width="lg"
      scroll="content"
      onClose={{ kind: "close", onClick: () => p.close(undefined) }}
    >
      <pre class="whitespace-pre-wrap break-words text-xs">{text}</pre>
    </ModalContainer>
  );
}
