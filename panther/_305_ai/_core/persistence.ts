// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  del,
  demoteStaleCarriers,
  get,
  legacyStripEphemeralMarkers,
  repairStrandedToolUse,
  set,
  STOPPED_REPLY_PLACEHOLDER,
  trimUnansweredServerToolUse,
} from "../deps.ts";
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
  formatVersion: number;
  // Session-approved tool names (approval mode "session").
  // Additive within v2: absent on older records → empty set, and an older
  // library reading a record that carries it just ignores the field — no
  // version bump needed (each migration targets its own legacy signature).
  approvedTools?: string[];
  // The request prefix the stored thinking blocks were minted under
  // (hashRequestPrefix), written by every turn. Additive within v2 like
  // approvedTools: absent only on a record saved before the hash existed,
  // which the next turn reads as a changed prefix.
  prefixHash?: string;
};

type V1Message = MessageParam | {
  role: "system";
  content: string | ContentBlock[];
};

type V1Conversation =
  & Omit<PersistedConversation, "messages" | "formatVersion">
  & { messages: V1Message[]; formatVersion?: undefined };

type StoredConversation = PersistedConversation | V1Conversation;

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

function migrateV1(record: V1Conversation): PersistedConversation {
  const messages = record.messages
    .filter((msg): msg is MessageParam => msg.role !== "system")
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

// A record saved before the release existed (no prefixHash) may end in a
// failed turn's carrier, which rendered permanently would ride every later
// request beside the retry's fresh digest. Like migrateV1 this targets its
// own legacy signature: a record with a hash was saved after a release and
// holds no such carrier.
function demotePreReleaseCarriers(
  record: PersistedConversation,
): PersistedConversation {
  if (record.prefixHash !== undefined) return record;
  const messages = demoteStaleCarriers(record.messages);
  return messages === record.messages ? record : { ...record, messages };
}

// A record an earlier library version saved stranded on an unanswered
// tool_use, or on a server_tool_use a cut-off reply never got the result of,
// would refuse every later request.
function answerStrandedToolUse(
  record: PersistedConversation,
): PersistedConversation {
  const messages = repairStrandedToolUse(
    trimUnansweredServerToolUse(record.messages, STOPPED_REPLY_PLACEHOLDER),
    "Tool execution interrupted: the conversation was reloaded before this tool ran",
  );
  return messages === record.messages ? record : { ...record, messages };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArrayOf(
  value: unknown,
  isItem: (item: unknown) => boolean,
): boolean {
  return Array.isArray(value) && value.every(isItem);
}

function isMessage(value: unknown): boolean {
  return isObject(value) &&
    (value.role === "user" || value.role === "assistant") &&
    (typeof value.content === "string" || Array.isArray(value.content));
}

function isDisplayItem(value: unknown): boolean {
  return isObject(value) && typeof value.type === "string";
}

// A record the engine cannot read would fail every send of the session; it
// loads as no record instead.
function isReadableRecord(record: Record<string, unknown>): boolean {
  return record.formatVersion === CURRENT_FORMAT_VERSION &&
    isArrayOf(record.messages, isMessage) &&
    isArrayOf(record.displayItems, isDisplayItem) &&
    (record.approvedTools === undefined ||
      isArrayOf(record.approvedTools, (t) => typeof t === "string")) &&
    (record.prefixHash === undefined || typeof record.prefixHash === "string");
}

export async function loadConversation(
  conversationId: string,
): Promise<PersistedConversation | undefined> {
  try {
    const record = await get<StoredConversation>(
      `ai-conv/${conversationId}`,
    );
    if (!record) return undefined;
    // A record ABOVE the current version passes through untouched: routing
    // a future format (version skew: rollback, or a lagging consumer app on
    // the same origin) through this version's migration, check or repairs
    // could destroy what it holds, such as literal marker text the user
    // typed. Only a true v1 record (formatVersion absent) migrates.
    if (
      typeof record.formatVersion === "number" &&
      record.formatVersion > CURRENT_FORMAT_VERSION
    ) {
      return record;
    }
    const current = record.formatVersion === undefined
      ? migrateV1(record)
      : record;
    if (!isReadableRecord(current)) {
      console.error(
        `Conversation record "${conversationId}" has a shape this version cannot read; loading it as no record.`,
      );
      return undefined;
    }
    return answerStrandedToolUse(demotePreReleaseCarriers(current));
  } catch (err) {
    console.error("Failed to load conversation:", err);
    return undefined;
  }
}

export async function saveConversation(
  conversationId: string,
  messages: MessageParam[],
  displayItems: DisplayItem[],
  approvedTools: string[],
  prefixHash: string | undefined,
): Promise<void> {
  try {
    const record: PersistedConversation = {
      conversationId,
      messages,
      // A pending approval card and an in-progress spinner are turn-scoped
      // UI state, never a record: a backstop beside the engine clearing
      // both before the save, since either reloaded would wait forever.
      displayItems: displayItems.filter(
        (item) =>
          item.type !== "approval_pending" && item.type !== "tool_in_progress",
      ),
      lastUpdated: new Date().toISOString(),
      formatVersion: CURRENT_FORMAT_VERSION,
      approvedTools,
      prefixHash,
    };
    await set(`ai-conv/${conversationId}`, record);
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
