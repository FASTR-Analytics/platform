import {
  TOOL_DEFINITIONS,
  getStartingConfigForReportItem,
  type ReportItemConfig,
} from "lib";
import type { ContentBlock, DisplayItem, MessageParam } from "./types";

export function getDisplayItemsFromMessage(
  message: MessageParam,
): DisplayItem[] {
  if (typeof message.content === "string") {
    return [
      {
        type: "text",
        role: message.role === "user" ? "user" : "assistant",
        text: message.content,
      },
    ];
  }

  const displayItems: DisplayItem[] = [];

  for (const block of message.content as ContentBlock[]) {
    if (block.type === "text" && block.text?.trim()) {
      displayItems.push({
        type: "text",
        role: message.role === "user" ? "user" : "assistant",
        text: block.text.trim(),
      });
    } else if (block.type === "tool_use") {
      if (block.name === TOOL_DEFINITIONS.SHOW_VISUALIZATION_TO_USER.name) {
        displayItems.push({
          type: "visualizations_to_show",
          role: "assistant",
          ids: (block.input as { ids: string[] }).ids,
        });
      } else if (block.name === TOOL_DEFINITIONS.CREATE_SLIDE.name) {
        displayItems.push({
          type: "show_slide",
          role: "assistant",
          slideDataFromAI: block.input,
        });
      }
    }
  }

  return displayItems;
}
