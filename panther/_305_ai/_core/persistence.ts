// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { del, get, legacyStripEphemeralMarkers, set } from "../deps.ts";
import type { ContentBlock, MessageParam } from "../deps.ts";
import type { DisplayItem } from "./types.ts";

// v2 (2026-07): user text is stored CLEAN with typed ephemeralSections; v1
// records (formatVersion absent) carry spliced <<<[…]>>> markers in user
// text and may hold {role: "system"} entries (Opus 4.8 histories). Loading
// a v1 record migrates it in memory — one-way, transparent, and
// rollback-safe (an older library reading a v2 record ignores the unknown
// ephemeralSections field and sees clean text). The record on disk upgrades
// on the next turn's save.
const CURRENT_FORMAT_VERSION = 2;

type PersistedConversation = {
  conversationId: string;
  messages: MessageParam[];
  displayItems: DisplayItem[];
  lastUpdated: string;
  formatVersion?: number;
};

function stripMarkersFromContent(
  content: string | ContentBlock[],
): string | ContentBlock[] {
  if (typeof content === "string") {
    return legacyStripEphemeralMarkers(content);
  }
  return content.map((block) =>
    block.type === "text"
      ? { ...block, text: legacyStripEphemeralMarkers(block.text) }
      : block
  );
}

function migrateV1(record: PersistedConversation): PersistedConversation {
  const messages = record.messages
    .filter((msg) => msg.role !== "system")
    .map((msg) =>
      msg.role === "user"
        ? { ...msg, content: stripMarkersFromContent(msg.content) }
        : msg
    );
  const displayItems = record.displayItems.map((item) =>
    item.type === "user_text"
      ? { ...item, text: legacyStripEphemeralMarkers(item.text).trim() }
      : item
  );
  return {
    ...record,
    messages,
    displayItems,
    formatVersion: CURRENT_FORMAT_VERSION,
  };
}

export async function loadConversation(
  conversationId: string,
): Promise<PersistedConversation | undefined> {
  try {
    const record = await get<PersistedConversation>(
      `ai-conv/${conversationId}`,
    );
    if (!record) return undefined;
    // Migrate ONLY true v1 records (formatVersion absent). Records at or
    // ABOVE the current version pass through untouched — running the v1
    // migration on a future format (version skew: rollback, or a lagging
    // consumer app on the same origin) would destructively strip literal
    // marker text the user typed.
    if (record.formatVersion === undefined) {
      return migrateV1(record);
    }
    return record;
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
      formatVersion: CURRENT_FORMAT_VERSION,
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
