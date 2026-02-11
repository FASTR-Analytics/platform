// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type AlertComponentProps, Button, ModalContainer } from "../deps.ts";

export type AIChatSystemPromptPanelProps = {
  systemPrompt: string | Array<{ type: "text"; text: string }>;
};

type Props = AlertComponentProps<AIChatSystemPromptPanelProps, void>;

export function AIChatSystemPromptPanel(p: Props) {
  const text =
    typeof p.systemPrompt === "string"
      ? p.systemPrompt
      : p.systemPrompt.map((block) => block.text).join("\n\n");

  return (
    <ModalContainer
      title="System prompt"
      width="lg"
      scroll="content"
      rightButtons={
        <Button intent="neutral" onClick={() => p.close(undefined)}>
          Close
        </Button>
      }
    >
      <pre class="whitespace-pre-wrap break-words text-xs">{text}</pre>
    </ModalContainer>
  );
}
