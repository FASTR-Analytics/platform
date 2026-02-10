// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { del, get, set } from "../deps.ts";
import { clearConversationPersistence } from "./persistence.ts";

const CONVERSATION_LIST_KEY = "ai-conv-list";
const LAST_ACTIVE_KEY_PREFIX = "ai-conv-last-active";

export type ConversationMetadata = {
  id: string;
  title: string;
  scope: string | undefined;
  createdAt: string;
  lastMessageAt: string;
};

export async function loadConversationList(): Promise<ConversationMetadata[]> {
  try {
    const data = await get<ConversationMetadata[]>(CONVERSATION_LIST_KEY);
    return data ?? [];
  } catch (err) {
    console.error("Failed to load conversation list:", err);
    return [];
  }
}

export async function saveConversationList(
  list: ConversationMetadata[],
): Promise<void> {
  try {
    await set(CONVERSATION_LIST_KEY, list);
  } catch (err) {
    console.error("Failed to save conversation list:", err);
  }
}

export async function addConversationToList(
  metadata: ConversationMetadata,
): Promise<void> {
  const list = await loadConversationList();
  list.unshift(metadata);
  await saveConversationList(list);
}

export async function updateConversationInList(
  id: string,
  updates: Partial<Pick<ConversationMetadata, "title" | "lastMessageAt">>,
): Promise<void> {
  const list = await loadConversationList();
  const index = list.findIndex((c) => c.id === id);
  if (index !== -1) {
    list[index] = { ...list[index], ...updates };
    await saveConversationList(list);
  }
}

export async function removeConversationFromList(id: string): Promise<void> {
  const list = await loadConversationList();
  const filtered = list.filter((c) => c.id !== id);
  await saveConversationList(filtered);
  await clearConversationPersistence(id);
}

export function generateConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateDefaultTitle(): string {
  const now = new Date();
  return `Chat ${now.toLocaleDateString()} ${
    now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }`;
}

export function generateTitleFromMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length <= 50) {
    return trimmed;
  }
  return trimmed.slice(0, 47) + "...";
}

function lastActiveKey(scope: string | undefined): string {
  return scope ? `${LAST_ACTIVE_KEY_PREFIX}-${scope}` : LAST_ACTIVE_KEY_PREFIX;
}

export async function loadLastActiveConversationId(
  scope: string | undefined,
): Promise<string | null> {
  try {
    const id = await get<string>(lastActiveKey(scope));
    return id ?? null;
  } catch {
    return null;
  }
}

export async function saveLastActiveConversationId(
  scope: string | undefined,
  id: string,
): Promise<void> {
  try {
    await set(lastActiveKey(scope), id);
  } catch {
    // ignore
  }
}
