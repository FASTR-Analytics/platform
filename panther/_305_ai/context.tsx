// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component, JSX } from "solid-js";
import { Show } from "solid-js";
import type { AIChatConfig } from "./_core/types.ts";
import { AIChatConfigContext } from "./_components/_create_ai_chat.ts";
import {
  ConversationsContext,
  createConversationsManager,
} from "./_components/use_conversations.ts";

type Props = {
  config: AIChatConfig;
  children: JSX.Element;
};

export function AIChatProvider(p: Props) {
  const conversationsManager = p.config.scope !== undefined
    ? createConversationsManager({ scope: p.config.scope })
    : undefined;

  return (
    <AIChatConfigContext.Provider value={p.config}>
      <Show
        when={conversationsManager}
        fallback={p.children}
      >
        {(manager) => (
          <ConversationsContext.Provider value={manager()}>
            {p.children}
          </ConversationsContext.Provider>
        )}
      </Show>
    </AIChatConfigContext.Provider>
  );
}
