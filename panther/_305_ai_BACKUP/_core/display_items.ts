// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ToolRegistry } from "./tool_engine.ts";
import type { ContentBlock, DisplayItem, MessageParam } from "./types.ts";

export function getDisplayItemsFromMessage(
  message: MessageParam,
  toolRegistry: ToolRegistry,
): DisplayItem[] {
  if (typeof message.content === "string") {
    const trimmed = message.content.trim();
    if (!trimmed) {
      return [];
    }
    return [
      {
        type: "text",
        role: message.role,
        text: trimmed,
      },
    ];
  }

  const displayItems: DisplayItem[] = [];
  const content = message.content as ContentBlock[];

  for (const block of content) {
    if (block.type === "tool_use") {
      const tool = toolRegistry.get(block.name);
      if (tool?.displayComponent) {
        displayItems.push({
          type: "tool_display",
          toolName: block.name,
          input: block.input,
        });
      }
      continue;
    }

    if (block.type === "text" && block.text?.trim()) {
      displayItems.push({
        type: "text",
        role: message.role,
        text: block.text.trim(),
      });
    }
  }

  return displayItems;
}
