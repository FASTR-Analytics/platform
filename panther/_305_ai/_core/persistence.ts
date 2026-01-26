// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { get, set, del } from "../deps.ts";
import type { MessageParam, DisplayItem } from "./types.ts";

type PersistedConversation = {
  conversationId: string;
  messages: MessageParam[];
  displayItems: DisplayItem[];
  lastUpdated: string;
};

export async function loadConversation(
  conversationId: string,
): Promise<PersistedConversation | undefined> {
  try {
    return await get<PersistedConversation>(`ai-conv/${conversationId}`);
  } catch (err) {
    console.error("Failed to load conversation:", err);
    return undefined;
  }
}

export async function saveConversation(
  conversationId: string,
  messages: MessageParam[],
  displayItems: DisplayItem[],
): Promise<void> {
  try {
    await set(`ai-conv/${conversationId}`, {
      conversationId,
      messages,
      displayItems,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to save conversation:", err);
  }
}

export async function clearConversationPersistence(
  conversationId: string,
): Promise<void> {
  try {
    await del(`ai-conv/${conversationId}`);
  } catch (err) {
    console.error("Failed to clear conversation persistence:", err);
  }
}
