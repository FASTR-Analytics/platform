// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ContentBlock, MessageParam } from "../deps.ts";
import type { DisplayItem } from "./types.ts";

export type ProvisionalCardLookup = (
  toolName: string,
) => { label: string | undefined } | null;

export function getDisplayItemsFromMessage(
  message: MessageParam,
): DisplayItem[] {
  if (typeof message.content === "string") {
    const text = message.content.trim();
    if (!text) {
      return [];
    }
    return [{
      type: message.role === "user" ? "user_text" : "assistant_text",
      text,
    }];
  }
  return getDisplayItemsFromBlocks(message.content, message.role, () => null);
}

// A tool block's input is never read: while its block streams it is a lazy
// parse of partial JSON, and a card's input is the complete one.
export function getStreamingDisplayItems(
  content: ContentBlock[],
  provisionalCard: ProvisionalCardLookup,
): DisplayItem[] {
  const answered = serverToolResultIds(content);
  return getDisplayItemsFromBlocks(content, "assistant", (block) => {
    const started = startedToolBlock(block);
    if (!started || answered.has(started.id)) {
      return null;
    }
    const card = provisionalCard(started.name);
    if (!card) {
      return null;
    }
    return {
      type: "tool_in_progress",
      toolUseId: started.id,
      toolName: started.name,
      toolInput: undefined,
      label: card.label,
    };
  });
}

function getDisplayItemsFromBlocks(
  content: ContentBlock[],
  role: MessageParam["role"],
  toolItem: (block: ContentBlock) => DisplayItem | null,
): DisplayItem[] {
  const displayItems: DisplayItem[] = [];

  // Accumulator for consecutive text blocks
  // (API returns multiple text blocks for citations - each cited claim is separate)
  let accumulatedText: string[] = [];

  const flushText = () => {
    if (accumulatedText.length > 0) {
      // Join without separator - blocks are sentence fragments with their own spacing
      const merged = accumulatedText.join("").trim();
      if (merged) {
        displayItems.push({
          type: role === "user" ? "user_text" : "assistant_text",
          text: merged,
        });
      }
      accumulatedText = [];
    }
  };

  for (const block of content) {
    if (block.type === "text") {
      // Don't trim here - preserve leading/trailing spaces so consecutive
      // citation fragments join cleanly.
      if (block.text) accumulatedText.push(block.text);
      continue;
    }

    // Any non-text block ends the current run of text, so text on either
    // side of a tool call, a server tool (web search / fetch, which appear
    // as server_tool_use + *_tool_result blocks), or a thinking block renders
    // as a separate paragraph instead of being concatenated into the
    // neighbouring text. Only consecutive text blocks (citations) merge.
    flushText();

    // Thinking summaries (thinking: {type: "adaptive", display:
    // "summarized"}) render as their own collapsed item. With display
    // "omitted" the thinking text is empty and nothing is shown.
    if (block.type === "thinking") {
      if (block.thinking.trim()) {
        displayItems.push({
          type: "thinking_summary",
          text: block.thinking.trim(),
        });
      }
      continue;
    }

    const item = toolItem(block);
    if (item) displayItems.push(item);
  }

  flushText();

  return displayItems;
}

// Server tool blocks come from the wire, outside the ContentBlock union, so
// they are read structurally.
function startedToolBlock(
  block: ContentBlock,
): { id: string; name: string } | null {
  if (block.type === "tool_use") {
    return { id: block.id, name: block.name };
  }
  const b = block as { type: string; id?: unknown; name?: unknown };
  if (
    b.type === "server_tool_use" && typeof b.id === "string" &&
    typeof b.name === "string"
  ) {
    return { id: b.id, name: b.name };
  }
  return null;
}

function serverToolResultIds(content: ContentBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const block of content) {
    const b = block as { type: string; tool_use_id?: unknown };
    if (b.type.endsWith("_tool_result") && typeof b.tool_use_id === "string") {
      ids.add(b.tool_use_id);
    }
  }
  return ids;
}
