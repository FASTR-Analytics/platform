import { createAITool } from "panther";
import { z } from "zod";
import { updateProjectView } from "~/state/t4_ui";
import { projectAIViewController } from "~/components/project_ai/ai_views";

// Kept as a PLAIN tool (PLAN_FUTURE_AI_ADOPTIONS.md feature 8, option 2): the
// family guard below is deliberately a SOFT return, not a throw — a throw
// would flip the refusal to is_error on the wire — and createNavigationTool's
// refusal channel is a hard AIToolFailure throw, so rewriting onto it would
// change today's behavior. The `startsWith("editing_")` check must stay a
// family test (not an enumerated availableIn whitelist), which would silently
// drift when a view is added. Rung 4 adds markAINavigation() attribution
// around updateProjectView when the __navigation digest goes live.
export function getToolsForNavigation() {
  return [
    createAITool({
      name: "switch_tab",
      description:
        "Switch the main project tab. Available tabs: reports, decks, visualizations, metrics, modules, data, settings. Cannot switch tabs while the user is editing a visualization, slide deck, or slide.",
      inputSchema: z.object({
        tab: z
          .enum(["reports", "decks", "visualizations", "metrics", "modules", "data", "settings"])
          .describe("The tab to switch to"),
      }),
      kind: "nav",
      handler: async (input) => {
        if (projectAIViewController.current().id.startsWith("editing_")) {
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
