import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import type { MetricWithStatus } from "lib";
import { simplifySlideForAI } from "~/components/slide_deck/slide_ai/extract_blocks_from_layout";
import { clientAIToolEnvFor } from "../client_env";

// DELIBERATE availableIn omission: get_slide reads by explicit slideId and
// works from any view (e.g. while editing a report that references deck
// content) — this is the historical guard-bypass made explicit, not an
// accident.
export function createGetSlideTool(
  projectId: string,
  metrics: MetricWithStatus[],
) {
  const env = clientAIToolEnvFor(projectId);
  return createAITool({
    name: "get_slide",
    description:
      "Retrieve the content and structure of a specific slide. For content slides, this returns a simplified view showing each content block with its unique ID, a summary, and the current layout structure (rows/columns with spans). Use block IDs with update_slide_content for content changes, or with modify_slide_layout for layout changes. Always call this before modifying a slide to see what's currently in it.",
    inputSchema: z.object({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
    }),
    kind: "read",
    handler: async (input) => {
      const res = await env.getSlide(input.slideId);
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
