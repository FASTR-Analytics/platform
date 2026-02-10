import { createAITool } from "panther";
import { z } from "zod";
import { updateProjectView } from "~/state/ui";
import type { AIContext } from "../../types";

export function getToolsForNavigation(aiContext: () => AIContext) {
  return [
    createAITool({
      name: "switch_tab",
      description:
        "Switch the main project tab. Available tabs: decks, visualizations, metrics, modules, data, settings. Cannot switch tabs while the user is editing a visualization, slide deck, or slide.",
      inputSchema: z.object({
        tab: z
          .enum(["decks", "visualizations", "metrics", "modules", "data", "settings"])
          .describe("The tab to switch to"),
      }),
      handler: async (input) => {
        const ctx = aiContext();
        if (ctx.mode.startsWith("editing_")) {
          return "Cannot switch tabs - user is currently editing. Ask them to save/close first.";
        }
        updateProjectView({ tab: input.tab });
        return `Switched to ${input.tab} tab`;
      },
      inProgressLabel: (input) => `Switching to ${input.tab}...`,
      completionMessage: (input) => `Switched to ${input.tab} tab`,
    }),
  ];
}
