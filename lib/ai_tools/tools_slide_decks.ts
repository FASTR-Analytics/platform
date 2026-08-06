import { createAITool } from "@timroberton/panther";
import { z } from "zod";
import type { SlideDeckSummary } from "../types/mod.ts";
import { formatSlideDecksListForAI } from "./format_slide_decks_list_for_ai.ts";

export function getSharedToolsForSlideDecks(slideDecks: SlideDeckSummary[]) {
  return [
    createAITool({
      name: "get_available_slide_decks",
      description: "Get a list of all slide decks with their IDs and labels.",
      inputSchema: z.object({}),
      handler: async () => {
        return formatSlideDecksListForAI(slideDecks);
      },
      inProgressLabel: "Getting available slide decks...",
      completionMessage: "Retrieved slide decks list",
      kind: "read",
      headless: true,
    }),
  ];
}
