// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ContentBlock, MessageParam } from "../deps.ts";
import type { DisplayItem } from "./types.ts";

export function getDisplayItemsFromMessage(
  message: MessageParam,
): DisplayItem[] {
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
    if (block.type === "tool_use") {
      flushText();
      continue;
    }

    if (block.type === "text" && block.text) {
      // Don't trim here - preserve leading/trailing spaces for proper joining
      accumulatedText.push(block.text);
    }
  }

  // Flush any remaining text
  flushText();

  return displayItems;
}
