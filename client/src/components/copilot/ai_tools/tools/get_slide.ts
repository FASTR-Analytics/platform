import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import type { MetricWithStatus } from "lib";
import { simplifySlideForAI } from "~/components/slide_deck/slide_ai/extract_blocks_from_layout";
import { copilotViews } from "~/components/copilot/ai_views";
import type { ClientAIToolEnv } from "../client_env";

// Slide reads are scoped by the open deck's product id, which the deck and
// slide views both carry.
export function createGetSlideTool(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return createAITool({
    viewRegistry: copilotViews,
    name: "get_slide",
    description:
      "Retrieve the content and structure of a specific slide in the open deck. For content slides, this returns a simplified view showing each content block with its unique ID, a summary, and the current layout structure (rows/columns with spans). Use block IDs with update_slide_content for content changes, or with modify_slide_layout for layout changes. Always call this before modifying a slide to see what's currently in it.",
    inputSchema: z.object({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
    }),
    availableIn: ["editing_slide_deck", "editing_slide"],
    kind: "read",
    handler: async (input, view) => {
      const res = await env.getSlide(view.params.deckId, input.slideId);
      if (!res.success) throw new AIToolFailure(res.err);
      return await simplifySlideForAI(env, res.data.slide, metrics);
    },
    inProgressLabel: (input) => `Getting slide ${input.slideId}...`,
    completionMessage: (input) => `Retrieved slide ${input.slideId}`,
  });
}
