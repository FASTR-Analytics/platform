// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ContentBlock, MessageParam } from "../deps.ts";
import type { DisplayItem } from "./types.ts";

// sentBlock: debug only. The text the wire puts in front of this message,
// so the first user bubble shows exactly what was sent.
export function getDisplayItemsFromMessage(
  message: MessageParam,
  sentBlock?: string,
): DisplayItem[] {
  const items = collectDisplayItems(message);
  return sentBlock === undefined ? items : withSentContext(sentBlock, items);
}

// The block goes on the first user bubble, where the wire splices it.
export function withSentContext(
  block: string,
  items: DisplayItem[],
): DisplayItem[] {
  const first = items.findIndex((item) => item.type === "user_text");
  return items.map((item, i) =>
    i === first && item.type === "user_text"
      ? { ...item, text: block + item.text }
      : item
  );
}

function collectDisplayItems(
  message: MessageParam,
): DisplayItem[] {
  // System messages carry ephemeral context for the model, never chat
  // content — they are not displayed.
  if (message.role === "system") {
    return [];
  }

  if (typeof message.content === "string") {
    const trimmed = message.content.trim();
    if (!trimmed) {
      return [];
    }
    return [
      {
        type: message.role === "user" ? "user_text" : "assistant_text",
        text: trimmed,
      } as DisplayItem,
    ];
  }

  const displayItems: DisplayItem[] = [];
  const content = message.content as ContentBlock[];

  // Accumulator for consecutive text blocks
  // (API returns multiple text blocks for citations - each cited claim is separate)
  let accumulatedText: string[] = [];

  const flushText = () => {
    if (accumulatedText.length > 0) {
      // Join without separator - blocks are sentence fragments with their own spacing
      const merged = accumulatedText.join("").trim();
      if (merged) {
        displayItems.push({
          type: message.role === "user" ? "user_text" : "assistant_text",
          text: merged,
        } as DisplayItem);
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
    if (block.type === "thinking" && block.thinking.trim()) {
      displayItems.push({
        type: "thinking_summary",
        text: block.thinking.trim(),
      });
    }
  }

  // Flush any remaining text
  flushText();

  return displayItems;
}
