import { createAITool } from "panther";
import { z } from "zod";
import { instanceState } from "~/state/instance/t1_store";
import { formatSlideDecksListForAI } from "./_internal/format_slide_decks_list_for_ai";

// Instance products of type slide_deck (SPA-only), read from instance T1 at
// call time so the list is never frozen at tool construction.
export function getClientToolsForSlideDecks() {
  return [
    createAITool({
      name: "get_available_slide_decks",
      description: "Get a list of all slide decks with their IDs and labels.",
      inputSchema: z.object({}),
      handler: async () =>
        formatSlideDecksListForAI(
          instanceState.products.filter((p) => p.type === "slide_deck"),
        ),
      inProgressLabel: "Getting available slide decks...",
      completionMessage: "Retrieved slide decks list",
      kind: "read",
    }),
  ];
}
