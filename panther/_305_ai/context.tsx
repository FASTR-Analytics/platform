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

export const AIChatProvider: Component<Props> = (props) => {
  const conversationsManager = props.config.scope !== undefined
    ? createConversationsManager({ scope: props.config.scope })
    : undefined;

  return (
    <AIChatConfigContext.Provider value={props.config}>
      <Show
        when={conversationsManager}
        fallback={props.children}
      >
        {(manager) => (
          <ConversationsContext.Provider value={manager()}>
            {props.children}
          </ConversationsContext.Provider>
        )}
      </Show>
    </AIChatConfigContext.Provider>
  );
};
