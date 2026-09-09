import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import type { MetricWithStatus } from "lib";
import { simplifySlideForAI } from "~/components/slide_deck/slide_ai/extract_blocks_from_layout";
import { copilotViewController } from "~/components/copilot/ai_views";
import { copilotAIToolEnv } from "../client_env";

// Slide reads are scoped by the owning deck's product id. An explicit
// productId wins; otherwise the open deck (deck editor or slide editor)
// supplies it.
function resolveProductId(productId: string | undefined): string {
  if (productId !== undefined) return productId;
  const view = copilotViewController.current();
  if (view.id === "editing_slide_deck" || view.id === "editing_slide") {
    return view.params.deckId;
  }
  throw new AIToolFailure(
    "productId is required when no slide deck is open. Get deck ids from get_available_slide_decks.",
  );
}

// DELIBERATE availableIn omission: get_slide reads by explicit slideId and
// works from any view (e.g. while editing a report that references deck
// content): this is the historical guard-bypass made explicit, not an
// accident.
export function createGetSlideTool(metrics: MetricWithStatus[]) {
  const env = copilotAIToolEnv;
  return createAITool({
    name: "get_slide",
    description:
      "Retrieve the content and structure of a specific slide. For content slides, this returns a simplified view showing each content block with its unique ID, a summary, and the current layout structure (rows/columns with spans). Use block IDs with update_slide_content for content changes, or with modify_slide_layout for layout changes. Always call this before modifying a slide to see what's currently in it.",
    inputSchema: z.object({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
      productId: z.string().optional().describe(
        "The slide deck's product id (from get_available_slide_decks). Defaults to the open deck when a slide deck or one of its slides is open.",
      ),
    }),
    kind: "read",
    handler: async (input) => {
      const res = await env.getSlide(
        resolveProductId(input.productId),
        input.slideId,
      );
      if (!res.success) throw new AIToolFailure(res.err);

      const simplified = await simplifySlideForAI(
        env,
        res.data.slide,
        metrics,
      );
      return simplified;
    },
    inProgressLabel: (input) => `Getting slide ${input.slideId}...`,
    completionMessage: (input) => `Retrieved slide ${input.slideId}`,
  });
}
