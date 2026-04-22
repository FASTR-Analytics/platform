import type { SlideDeckSummary } from "lib";
import { createAITool } from "panther";
import { z } from "zod";
import { formatSlideDecksListForAI } from "./_internal/format_slide_decks_list_for_ai";

export function getToolsForSlideDecks(slideDecks: SlideDeckSummary[]) {
  return [
    createAITool({
      name: "get_available_slide_decks",
      description:
        "Get a list of all slide decks with their IDs and labels.",
      inputSchema: z.object({}),
      handler: async () => {
        return formatSlideDecksListForAI(slideDecks);
      },
      inProgressLabel: "Getting available slide decks...",
      completionMessage: "Retrieved slide decks list",
    }),
  ];
}
