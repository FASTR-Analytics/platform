// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MessageParam, Usage } from "../deps.ts";
import { createSignal } from "solid-js";
import type { ChatState, DisplayItem } from "./types.ts";
import {
  clearConversationPersistence,
  loadConversation,
} from "./persistence.ts";

export type ConversationStore = {
  messages: ReturnType<typeof createSignal<MessageParam[]>>;
  displayItems: ReturnType<typeof createSignal<DisplayItem[]>>;
  isLoading: ReturnType<typeof createSignal<boolean>>;
  isStreaming: ReturnType<typeof createSignal<boolean>>;
  isProcessingTools: ReturnType<typeof createSignal<boolean>>;
  error: ReturnType<typeof createSignal<string | null>>;
  usage: ReturnType<typeof createSignal<Usage | null>>;
  currentStreamingText: ReturnType<typeof createSignal<string | undefined>>;
  usageHistory: ReturnType<typeof createSignal<Usage[]>>;
  serverToolLabel: ReturnType<typeof createSignal<string | undefined>>;
};

const stores = new Map<string, ConversationStore>();

export function getOrCreateConversationStore(
  conversationId: string,
  enablePersistence: boolean = true,
): ConversationStore {
  if (!stores.has(conversationId)) {
    // Create store with empty state (synchronous)
    const store: ConversationStore = {
      messages: createSignal<MessageParam[]>([]),
      displayItems: createSignal<DisplayItem[]>([]),
      isLoading: createSignal(false),
      isStreaming: createSignal(false),
      isProcessingTools: createSignal(false),
      error: createSignal<string | null>(null),
      usage: createSignal<Usage | null>(null),
      currentStreamingText: createSignal<string | undefined>(undefined),
      usageHistory: createSignal<Usage[]>([]),
      serverToolLabel: createSignal<string | undefined>(undefined),
    };

    stores.set(conversationId, store);

    // Hydrate from IndexedDB asynchronously (non-blocking)
    if (enablePersistence) {
      loadConversation(conversationId).then((persisted) => {
        const [currentMessages] = store.messages;
        if (
          persisted && persisted.messages.length > 0 &&
          currentMessages().length === 0
        ) {
          const [, setMessages] = store.messages;
          const [, setDisplayItems] = store.displayItems;
          setMessages(persisted.messages);
          setDisplayItems(persisted.displayItems);
        }
      });
    }
  }
  return stores.get(conversationId)!;
}

export function clearConversationStore(conversationId: string): void {
  const store = stores.get(conversationId);
  if (store) {
    const [, setMessages] = store.messages;
    const [, setDisplayItems] = store.displayItems;
    const [, setIsLoading] = store.isLoading;
    const [, setIsStreaming] = store.isStreaming;
    const [, setIsProcessingTools] = store.isProcessingTools;
    const [, setError] = store.error;
    const [, setUsage] = store.usage;
    const [, setCurrentStreamingText] = store.currentStreamingText;
    const [, setUsageHistory] = store.usageHistory;
    const [, setServerToolLabel] = store.serverToolLabel;

    setMessages([]);
    setDisplayItems([]);
    setIsLoading(false);
    setIsStreaming(false);
    setIsProcessingTools(false);
    setError(null);
    setUsage(null);
    setCurrentStreamingText(undefined);
    setUsageHistory([]);
    setServerToolLabel(undefined);

    // Also clear persisted data
    clearConversationPersistence(conversationId);
  }
}

export function deleteConversationStore(conversationId: string): void {
  stores.delete(conversationId);
}

export function getConversationState(conversationId: string): ChatState {
  const store = getOrCreateConversationStore(conversationId);
  const [messages] = store.messages;
  const [displayItems] = store.displayItems;
  const [isLoading] = store.isLoading;
  const [isStreaming] = store.isStreaming;
  const [error] = store.error;
  const [usage] = store.usage;
  const [currentStreamingText] = store.currentStreamingText;
  const [serverToolLabel] = store.serverToolLabel;

  return {
    messages: messages(),
    displayItems: displayItems(),
    isLoading: isLoading(),
    isStreaming: isStreaming(),
    error: error(),
    usage: usage(),
    currentStreamingText: currentStreamingText(),
    serverToolLabel: serverToolLabel(),
  };
}
