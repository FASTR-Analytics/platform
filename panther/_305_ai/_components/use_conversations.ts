// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createContext, createSignal, onMount, useContext } from "solid-js";
import type { Accessor } from "solid-js";
import {
  addConversationToList,
  type ConversationMetadata,
  generateConversationId,
  generateDefaultTitle,
  generateTitleFromMessage,
  loadConversationList,
  loadLastActiveConversationId,
  removeConversationFromList,
  saveLastActiveConversationId,
  updateConversationInList,
} from "../_core/conversations_persistence.ts";
import {
  clearConversationStore,
  deleteConversationStore,
} from "../_core/conversation_store.ts";

export type UseConversationsOptions = {
  scope?: string;
};

export type ConversationsContextValue = {
  conversations: Accessor<ConversationMetadata[]>;
  activeConversationId: Accessor<string | null>;
  activeConversation: Accessor<ConversationMetadata | null>;
  createConversation: () => Promise<string>;
  switchTo: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  updateLastMessageTime: (id: string) => Promise<void>;
  updateTitleFromFirstMessage: (id: string, message: string) => Promise<void>;
  scope: string | undefined;
};

export const ConversationsContext = createContext<ConversationsContextValue>();

export function createConversationsManager(
  options?: UseConversationsOptions,
): ConversationsContextValue {
  const scope = options?.scope;

  const [allConversations, setAllConversations] = createSignal<
    ConversationMetadata[]
  >([]);
  const [activeConversationId, setActiveConversationId] = createSignal<
    string | null
  >(null);

  const conversations = () => {
    if (scope === undefined) {
      return allConversations();
    }
    return allConversations().filter((c) => c.scope === scope);
  };

  const activeConversation = () => {
    const id = activeConversationId();
    if (!id) return null;
    return allConversations().find((c) => c.id === id) ?? null;
  };

  onMount(async () => {
    const [list, lastActiveId] = await Promise.all([
      loadConversationList(),
      loadLastActiveConversationId(scope),
    ]);
    setAllConversations(list);

    const scopedConversations = scope === undefined
      ? list
      : list.filter((c) => c.scope === scope);

    if (scopedConversations.length > 0) {
      const lastActive = lastActiveId
        ? scopedConversations.find((c) => c.id === lastActiveId)
        : undefined;
      setActiveConversationId(
        lastActive ? lastActive.id : scopedConversations[0].id,
      );
    } else {
      const newId = await createConversation();
      setActiveConversationId(newId);
    }
  });

  async function createConversation(): Promise<string> {
    const id = generateConversationId();
    const now = new Date().toISOString();
    const metadata: ConversationMetadata = {
      id,
      title: generateDefaultTitle(),
      scope,
      createdAt: now,
      lastMessageAt: now,
    };

    await addConversationToList(metadata);
    setAllConversations((prev) => [metadata, ...prev]);
    setActiveConversationId(id);
    saveLastActiveConversationId(scope, id);

    return id;
  }

  function switchTo(id: string) {
    const exists = allConversations().find((c) => c.id === id);
    if (exists) {
      setActiveConversationId(id);
      saveLastActiveConversationId(scope, id);
    }
  }

  async function deleteConversation(id: string) {
    const current = activeConversationId();

    await removeConversationFromList(id);
    clearConversationStore(id);
    deleteConversationStore(id);

    setAllConversations((prev) => prev.filter((c) => c.id !== id));

    if (current === id) {
      const remaining = conversations();
      if (remaining.length > 0) {
        setActiveConversationId(remaining[0].id);
      } else {
        const newId = await createConversation();
        setActiveConversationId(newId);
      }
    }
  }

  async function renameConversation(id: string, title: string) {
    await updateConversationInList(id, { title });
    setAllConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  }

  async function updateLastMessageTime(id: string) {
    const lastMessageAt = new Date().toISOString();
    await updateConversationInList(id, { lastMessageAt });
    setAllConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, lastMessageAt } : c))
    );
  }

  async function updateTitleFromFirstMessage(id: string, message: string) {
    const conv = allConversations().find((c) => c.id === id);
    if (!conv) return;

    const wasDefaultTitle = conv.title.startsWith("Chat ");
    if (wasDefaultTitle) {
      const newTitle = generateTitleFromMessage(message);
      await renameConversation(id, newTitle);
    }
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    createConversation,
    switchTo,
    deleteConversation,
    renameConversation,
    updateLastMessageTime,
    updateTitleFromFirstMessage,
    scope,
  };
}

export function useConversations(): ConversationsContextValue {
  const context = useContext(ConversationsContext);
  if (!context) {
    throw new Error(
      "useConversations must be used within an AIChatProvider with scope",
    );
  }
  return context;
}
